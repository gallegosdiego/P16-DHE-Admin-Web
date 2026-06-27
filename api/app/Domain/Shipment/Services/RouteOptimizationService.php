<?php

namespace App\Domain\Shipment\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class RouteOptimizationService
{
    /**
     * Optimize stop order using Google Routes API.
     *
     * Calls the Routes API with optimizeWaypointOrder=true and reorders
     * the given stops based on the returned optimized indices.
     *
     * @param  array  $driverLocation  ['lat' => float, 'lng' => float]
     * @param  Collection  $stops  Collection of RouteStop models (with shipment loaded)
     * @return array ['stop_ids' => int[], 'distance_meters' => int, 'duration_seconds' => int]
     *
     * @throws \Exception on API failure so the controller can fall back
     */
    public function optimize(array $driverLocation, Collection $stops): array
    {
        // Single stop — nothing to optimize
        if ($stops->count() === 1) {
            $stop = $stops->first();
            $distance = $this->haversine(
                $driverLocation,
                ['lat' => (float) $stop->shipment->recipient_lat, 'lng' => (float) $stop->shipment->recipient_lng]
            );

            return [
                'stop_ids'         => [$stop->id],
                'distance_meters'  => (int) round($distance),
                'duration_seconds' => (int) round($distance / 8.33),
            ];
        }

        // Two stops — compute distance directly without Google API
        if ($stops->count() === 2) {
            return $this->optimizeFallback($driverLocation, $stops);
        }

        // Find the geographically farthest stop from the driver to use as destination
        $farthestStop = $stops->sortByDesc(fn ($s) => $this->haversine(
            $driverLocation,
            ['lat' => (float) $s->shipment->recipient_lat, 'lng' => (float) $s->shipment->recipient_lng]
        ))->first();

        // Intermediates = all stops except the farthest (destination)
        $intermediateStops = $stops->filter(fn ($s) => $s->id !== $farthestStop->id)->values();

        $intermediates = $intermediateStops->map(fn ($s) => [
            'location' => [
                'latLng' => [
                    'latitude'  => (float) $s->shipment->recipient_lat,
                    'longitude' => (float) $s->shipment->recipient_lng,
                ],
            ],
        ])->values()->toArray();

        $body = [
            'origin' => [
                'location' => [
                    'latLng' => [
                        'latitude'  => (float) $driverLocation['lat'],
                        'longitude' => (float) $driverLocation['lng'],
                    ],
                ],
            ],
            'destination' => [
                'location' => [
                    'latLng' => [
                        'latitude'  => (float) $farthestStop->shipment->recipient_lat,
                        'longitude' => (float) $farthestStop->shipment->recipient_lng,
                    ],
                ],
            ],
            'intermediates'          => $intermediates,
            'travelMode'             => 'DRIVE',
            'optimizeWaypointOrder'  => true,
            'routingPreference'      => 'TRAFFIC_AWARE',
        ];

        $apiKey = config('services.google.maps_key');

        if (! $apiKey) {
            Log::info('RouteOptimizationService: GOOGLE_MAPS_API_KEY no configurada, usando optimizacion local.');

            return $this->optimizeFallback($driverLocation, $stops);
        }

        $response = Http::withHeaders([
            'X-Goog-Api-Key'       => $apiKey,
            'X-Goog-FieldMask'     => 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration',
        ])->timeout(10)->post('https://routes.googleapis.com/directions/v2:computeRoutes', $body);

        if ($response->failed()) {
            Log::warning('Google Routes API returned error', [
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);
            throw new \RuntimeException('Google Routes API failed with status ' . $response->status());
        }

        $data = $response->json();

        if (empty($data['routes'][0])) {
            Log::warning('Google Routes API returned no routes', ['response' => $data]);
            throw new \RuntimeException('Google Routes API returned no routes');
        }

        $route = $data['routes'][0];

        // Reorder intermediate stops using optimized indices
        $optimizedIndices = $route['optimizedIntermediateWaypointIndex'] ?? [];
        $orderedIds = [];

        foreach ($optimizedIndices as $idx) {
            $orderedIds[] = $intermediateStops[$idx]->id;
        }

        // Append the destination (farthest stop) at the end
        $orderedIds[] = $farthestStop->id;

        // Parse duration string (e.g. "1234s") to integer seconds
        $durationSeconds = 0;
        if (isset($route['duration'])) {
            $durationSeconds = (int) filter_var($route['duration'], FILTER_SANITIZE_NUMBER_INT);
        }

        return [
            'stop_ids'         => $orderedIds,
            'distance_meters'  => (int) ($route['distanceMeters'] ?? 0),
            'duration_seconds' => $durationSeconds,
        ];
    }

    /**
     * Fallback optimization using Nearest Neighbor + 2-opt improvement.
     *
     * Uses haversine distances to order stops locally without any external API call.
     *
     * @param  array  $driverLocation  ['lat' => float, 'lng' => float]
     * @param  Collection  $stops  Collection of RouteStop models (with shipment loaded)
     * @return array ['stop_ids' => int[], 'distance_meters' => int, 'duration_seconds' => int]
     */
    public function optimizeFallback(array $driverLocation, Collection $stops): array
    {
        // Single stop — nothing to optimize
        if ($stops->count() === 1) {
            $stop = $stops->first();
            $distance = $this->haversine(
                $driverLocation,
                ['lat' => (float) $stop->shipment->recipient_lat, 'lng' => (float) $stop->shipment->recipient_lng]
            );

            return [
                'stop_ids'         => [$stop->id],
                'distance_meters'  => (int) round($distance),
                'duration_seconds' => (int) round($distance / 8.33),
            ];
        }

        // Build coordinate map: stop_id => ['lat' => ..., 'lng' => ...]
        $coords = [];
        foreach ($stops as $s) {
            $coords[$s->id] = [
                'lat' => (float) $s->shipment->recipient_lat,
                'lng' => (float) $s->shipment->recipient_lng,
            ];
        }

        $stopIds = array_keys($coords);

        // ── Nearest Neighbor ──────────────────────
        $ordered = [];
        $remaining = $stopIds;
        $currentPos = $driverLocation;

        while (count($remaining) > 0) {
            $nearestIdx = null;
            $nearestDist = PHP_FLOAT_MAX;

            foreach ($remaining as $idx => $id) {
                $dist = $this->haversine($currentPos, $coords[$id]);
                if ($dist < $nearestDist) {
                    $nearestDist = $dist;
                    $nearestIdx = $idx;
                }
            }

            $chosenId = $remaining[$nearestIdx];
            $ordered[] = $chosenId;
            $currentPos = $coords[$chosenId];
            unset($remaining[$nearestIdx]);
            $remaining = array_values($remaining);
        }

        // ── 2-opt improvement ─────────────────────
        $improved = true;
        while ($improved) {
            $improved = false;
            $n = count($ordered);

            for ($i = 0; $i < $n - 1; $i++) {
                for ($j = $i + 2; $j < $n; $j++) {
                    $before = $this->segmentCost($ordered, $coords, $driverLocation, $i, $j);
                    // Try reversing the segment between i+1 and j
                    $reversed = $ordered;
                    $sub = array_reverse(array_slice($reversed, $i + 1, $j - $i));
                    array_splice($reversed, $i + 1, $j - $i, $sub);
                    $after = $this->segmentCost($reversed, $coords, $driverLocation, $i, $j);

                    if ($after < $before) {
                        $ordered = $reversed;
                        $improved = true;
                    }
                }
            }
        }

        // Calculate total distance along the optimized route
        $totalDistance = $this->haversine($driverLocation, $coords[$ordered[0]]);
        for ($k = 0; $k < count($ordered) - 1; $k++) {
            $totalDistance += $this->haversine($coords[$ordered[$k]], $coords[$ordered[$k + 1]]);
        }

        return [
            'stop_ids'         => $ordered,
            'distance_meters'  => (int) round($totalDistance),
            'duration_seconds' => (int) round($totalDistance / 8.33), // ~30 km/h average in Bogotá
        ];
    }

    /**
     * Calculate cost of edges around a 2-opt segment for comparison.
     */
    private function segmentCost(array $order, array $coords, array $driverLocation, int $i, int $j): float
    {
        $n = count($order);
        // Edge before the segment
        $prevPos = $i === 0 ? $driverLocation : $coords[$order[$i]];
        $cost = $this->haversine($prevPos, $coords[$order[$i + 1]]);

        // Edge after the segment (if j is not the last element)
        if ($j + 1 < $n) {
            $cost += $this->haversine($coords[$order[$j]], $coords[$order[$j + 1]]);
        }

        return $cost;
    }

    /**
     * Haversine formula — distance between two lat/lng points in meters.
     *
     * @param  array  $a  ['lat' => float, 'lng' => float]
     * @param  array  $b  ['lat' => float, 'lng' => float]
     * @return float  Distance in meters
     */
    private function haversine(array $a, array $b): float
    {
        $earthRadius = 6371000; // meters

        $latA = deg2rad($a['lat']);
        $latB = deg2rad($b['lat']);
        $dLat = deg2rad($b['lat'] - $a['lat']);
        $dLng = deg2rad($b['lng'] - $a['lng']);

        $h = sin($dLat / 2) ** 2
            + cos($latA) * cos($latB) * sin($dLng / 2) ** 2;

        return 2 * $earthRadius * asin(sqrt($h));
    }
}
