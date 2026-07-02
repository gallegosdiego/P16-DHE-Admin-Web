<?php

namespace App\Domain\Shipment\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class RouteOptimizationService
{
    public function optimize(array $driverLocation, Collection $stops): array
    {
        if ($stops->count() === 1) {
            return $this->singleStopResult($driverLocation, $stops->first());
        }

        if ($stops->count() === 2) {
            return $this->optimizeFallback($driverLocation, $stops);
        }

        $apiKey = config('services.google.maps_key');
        if (! $apiKey) {
            Log::info('RouteOptimizationService: GOOGLE_MAPS_API_KEY no configurada, usando optimizacion local.');

            return $this->optimizeFallback($driverLocation, $stops);
        }

        try {
            return $this->computeGoogleRoute($driverLocation, $stops, true);
        } catch (\Throwable $exception) {
            Log::warning('RouteOptimizationService: Google Routes fallo, usando optimizacion local.', [
                'error' => $exception->getMessage(),
            ]);

            return $this->optimizeFallback($driverLocation, $stops);
        }
    }

    public function traceOrderedRoute(array $origin, Collection $orderedStops): array
    {
        if ($orderedStops->isEmpty()) {
            return [
                'stop_ids' => [],
                'distance_meters' => 0,
                'duration_seconds' => 0,
                'source' => 'sequence_fallback',
                'overview_polyline' => null,
                'legs' => [],
            ];
        }

        if ($orderedStops->count() === 1) {
            return $this->singleStopResult($origin, $orderedStops->first());
        }

        $apiKey = config('services.google.maps_key');
        if (! $apiKey) {
            return $this->buildFallbackGeometry($origin, $orderedStops, 'local_fallback');
        }

        try {
            return $this->computeGoogleRoute($origin, $orderedStops, false);
        } catch (\Throwable $exception) {
            Log::warning('RouteOptimizationService: trazado Google Routes fallo, usando fallback local.', [
                'error' => $exception->getMessage(),
            ]);

            return $this->buildFallbackGeometry($origin, $orderedStops, 'local_fallback');
        }
    }

    public function optimizeFallback(array $driverLocation, Collection $stops): array
    {
        if ($stops->count() === 1) {
            return $this->singleStopResult($driverLocation, $stops->first());
        }

        $coords = [];
        foreach ($stops as $stop) {
            $coords[$stop->id] = $this->pointForStop($stop);
        }

        $remaining = array_keys($coords);
        $orderedIds = [];
        $currentPos = $driverLocation;

        while (count($remaining) > 0) {
            $nearestIdx = null;
            $nearestDist = PHP_FLOAT_MAX;

            foreach ($remaining as $idx => $stopId) {
                $distance = $this->haversine($currentPos, $coords[$stopId]);
                if ($distance < $nearestDist) {
                    $nearestDist = $distance;
                    $nearestIdx = $idx;
                }
            }

            $chosenId = $remaining[$nearestIdx];
            $orderedIds[] = $chosenId;
            $currentPos = $coords[$chosenId];
            unset($remaining[$nearestIdx]);
            $remaining = array_values($remaining);
        }

        $improved = true;
        while ($improved) {
            $improved = false;
            $count = count($orderedIds);

            for ($i = 0; $i < $count - 1; $i++) {
                for ($j = $i + 2; $j < $count; $j++) {
                    $before = $this->segmentCost($orderedIds, $coords, $driverLocation, $i, $j);

                    $reversed = $orderedIds;
                    $segment = array_reverse(array_slice($reversed, $i + 1, $j - $i));
                    array_splice($reversed, $i + 1, $j - $i, $segment);

                    $after = $this->segmentCost($reversed, $coords, $driverLocation, $i, $j);

                    if ($after < $before) {
                        $orderedIds = $reversed;
                        $improved = true;
                    }
                }
            }
        }

        $orderedStops = collect($orderedIds)
            ->map(fn (int $stopId) => $stops->firstWhere('id', $stopId))
            ->filter()
            ->values();

        return $this->buildFallbackGeometry($driverLocation, $orderedStops, 'local_fallback');
    }

    private function computeGoogleRoute(array $origin, Collection $stops, bool $optimizeWaypointOrder): array
    {
        if ($stops->isEmpty()) {
            return [
                'stop_ids' => [],
                'distance_meters' => 0,
                'duration_seconds' => 0,
                'source' => 'google_routes',
                'overview_polyline' => null,
                'legs' => [],
            ];
        }

        $destination = $optimizeWaypointOrder
            ? $stops->sortByDesc(fn ($stop) => $this->haversine($origin, $this->pointForStop($stop)))->first()
            : $stops->last();

        $intermediateStops = $optimizeWaypointOrder
            ? $stops->filter(fn ($stop) => $stop->id !== $destination->id)->values()
            : $stops->slice(0, -1)->values();

        $body = [
            'origin' => [
                'location' => [
                    'latLng' => [
                        'latitude' => (float) $origin['lat'],
                        'longitude' => (float) $origin['lng'],
                    ],
                ],
            ],
            'destination' => $this->waypointForStop($destination),
            'intermediates' => $intermediateStops->map(fn ($stop) => $this->waypointForStop($stop))->values()->all(),
            'travelMode' => 'DRIVE',
            'routingPreference' => 'TRAFFIC_AWARE',
        ];

        if ($optimizeWaypointOrder) {
            $body['optimizeWaypointOrder'] = true;
        }

        $response = Http::withHeaders([
            'X-Goog-Api-Key' => (string) config('services.google.maps_key'),
            'X-Goog-FieldMask' => implode(',', [
                'routes.optimizedIntermediateWaypointIndex',
                'routes.distanceMeters',
                'routes.duration',
                'routes.polyline.encodedPolyline',
                'routes.legs.distanceMeters',
                'routes.legs.duration',
                'routes.legs.polyline.encodedPolyline',
            ]),
        ])
            ->timeout(12)
            ->post('https://routes.googleapis.com/directions/v2:computeRoutes', $body);

        if ($response->failed()) {
            throw new \RuntimeException('Google Routes API failed with status ' . $response->status());
        }

        $data = $response->json();
        $route = $data['routes'][0] ?? null;

        if (! $route) {
            throw new \RuntimeException('Google Routes API returned no routes');
        }

        $orderedStopIds = $optimizeWaypointOrder
            ? $this->orderedIdsFromOptimizedRoute($intermediateStops, $destination->id, $route)
            : $stops->pluck('id')->map(fn ($id) => (int) $id)->values()->all();

        return [
            'stop_ids' => $orderedStopIds,
            'distance_meters' => (int) ($route['distanceMeters'] ?? 0),
            'duration_seconds' => $this->durationToSeconds($route['duration'] ?? null),
            'source' => 'google_routes',
            'overview_polyline' => data_get($route, 'polyline.encodedPolyline'),
            'legs' => $this->mapGoogleLegs($orderedStopIds, $route['legs'] ?? []),
        ];
    }

    private function orderedIdsFromOptimizedRoute(Collection $intermediateStops, int $destinationId, array $route): array
    {
        $orderedIds = [];

        foreach (($route['optimizedIntermediateWaypointIndex'] ?? []) as $index) {
            if ($intermediateStops->has($index)) {
                $orderedIds[] = (int) $intermediateStops[$index]->id;
            }
        }

        $orderedIds[] = $destinationId;

        return $orderedIds;
    }

    private function mapGoogleLegs(array $orderedStopIds, array $legs): array
    {
        $mapped = [];

        foreach ($orderedStopIds as $index => $stopId) {
            $leg = $legs[$index] ?? [];
            $mapped[] = [
                'stop_id' => (int) $stopId,
                'distance_meters' => (int) ($leg['distanceMeters'] ?? 0),
                'duration_seconds' => $this->durationToSeconds($leg['duration'] ?? null),
                'encoded_polyline' => data_get($leg, 'polyline.encodedPolyline'),
            ];
        }

        return $mapped;
    }

    private function buildFallbackGeometry(array $origin, Collection $orderedStops, string $source): array
    {
        $legs = [];
        $current = $origin;
        $totalDistance = 0.0;
        $totalDuration = 0;

        foreach ($orderedStops as $stop) {
            $destination = $this->pointForStop($stop);
            $distance = $this->haversine($current, $destination);
            $duration = (int) round($distance / 8.33);

            $legs[] = [
                'stop_id' => (int) $stop->id,
                'distance_meters' => (int) round($distance),
                'duration_seconds' => $duration,
                'encoded_polyline' => null,
            ];

            $totalDistance += $distance;
            $totalDuration += $duration;
            $current = $destination;
        }

        return [
            'stop_ids' => $orderedStops->pluck('id')->map(fn ($id) => (int) $id)->values()->all(),
            'distance_meters' => (int) round($totalDistance),
            'duration_seconds' => $totalDuration,
            'source' => $source,
            'overview_polyline' => null,
            'legs' => $legs,
        ];
    }

    private function singleStopResult(array $origin, object $stop): array
    {
        $distance = $this->haversine($origin, $this->pointForStop($stop));
        $duration = (int) round($distance / 8.33);

        return [
            'stop_ids' => [(int) $stop->id],
            'distance_meters' => (int) round($distance),
            'duration_seconds' => $duration,
            'source' => 'local_fallback',
            'overview_polyline' => null,
            'legs' => [[
                'stop_id' => (int) $stop->id,
                'distance_meters' => (int) round($distance),
                'duration_seconds' => $duration,
                'encoded_polyline' => null,
            ]],
        ];
    }

    private function waypointForStop(object $stop): array
    {
        return [
            'location' => [
                'latLng' => [
                    'latitude' => (float) $stop->shipment->recipient_lat,
                    'longitude' => (float) $stop->shipment->recipient_lng,
                ],
            ],
        ];
    }

    private function pointForStop(object $stop): array
    {
        return [
            'lat' => (float) $stop->shipment->recipient_lat,
            'lng' => (float) $stop->shipment->recipient_lng,
        ];
    }

    private function durationToSeconds(mixed $duration): int
    {
        if (! is_string($duration) || $duration === '') {
            return 0;
        }

        return (int) filter_var($duration, FILTER_SANITIZE_NUMBER_INT);
    }

    private function segmentCost(array $order, array $coords, array $driverLocation, int $i, int $j): float
    {
        $count = count($order);
        $previous = $i === 0 ? $driverLocation : $coords[$order[$i]];
        $cost = $this->haversine($previous, $coords[$order[$i + 1]]);

        if ($j + 1 < $count) {
            $cost += $this->haversine($coords[$order[$j]], $coords[$order[$j + 1]]);
        }

        return $cost;
    }

    private function haversine(array $a, array $b): float
    {
        $earthRadius = 6371000;

        $latA = deg2rad($a['lat']);
        $latB = deg2rad($b['lat']);
        $deltaLat = deg2rad($b['lat'] - $a['lat']);
        $deltaLng = deg2rad($b['lng'] - $a['lng']);

        $h = sin($deltaLat / 2) ** 2
            + cos($latA) * cos($latB) * sin($deltaLng / 2) ** 2;

        return 2 * $earthRadius * asin(sqrt($h));
    }
}
