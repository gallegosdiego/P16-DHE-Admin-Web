<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Models\ShipmentEvent;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Services\RouteOptimizationService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class RouteController extends Controller
{
    public function myRoute(Request $request): JsonResponse
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);

        if ($driverId <= 0) {
            return response()->json(['error' => 'Acceso denegado'], 403);
        }

        $today = now()->toDateString();

        $route = $this->findDriverNavigableRouteRow($driverId, $today);

        if (! $route) {
            return response()->json([
                'route' => null,
                'message' => 'No tienes ruta asignada para hoy.',
            ]);
        }

        return response()->json([
            'route' => $this->driverRoutePayload((int) $route->id),
        ]);
    }

    public function operationalState(Request $request): JsonResponse
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);

        if ($driverId <= 0) {
            return response()->json(['error' => 'Acceso denegado'], 403);
        }

        $today = now()->toDateString();
        $route = $this->findDriverNavigableRouteRow($driverId, $today);
        $routeDayRows = $this->driverRouteDayRows($driverId, $today);

        $routePayload = $route ? $this->driverRoutePayload((int) $route->id) : null;
        $routeDayPayload = $this->driverRouteDayPayload($routeDayRows);
        $assignedShipments = $this->availableShipmentRowsForDriver($driverId)
            ->map(fn (object $shipment) => $this->driverShipmentPayloadFromRow($shipment))
            ->values();

        return response()->json([
            'route' => $routePayload,
            'route_day' => $routeDayPayload,
            'assigned_shipments' => $assignedShipments,
            'flags' => $this->driverOperationalFlags($routePayload, $routeDayPayload, $assignedShipments->count()),
            'summary' => $this->driverOperationalSummary($routePayload, $routeDayPayload, $assignedShipments->count()),
            'navigation' => $this->driverOperationalNavigation($routePayload),
            'message' => $this->driverOperationalMessage($routePayload, $routeDayPayload, $assignedShipments->count()),
        ]);
    }

    public function updateDriverLocation(Request $request): JsonResponse
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);

        if ($driverId <= 0) {
            return response()->json(['error' => 'Acceso denegado'], 403);
        }

        $data = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'heading' => ['nullable', 'numeric', 'between:0,360'],
            'speed' => ['nullable', 'numeric', 'min:0'],
        ]);

        if (! $this->driverLocationColumnsAvailable()) {
            return response()->json([
                'ok' => false,
                'message' => 'El esquema actual no soporta ubicacion en vivo.',
            ], 409);
        }

        DB::table('drivers')
            ->where('id', $driverId)
            ->update([
                'last_lat' => (float) $data['lat'],
                'last_lng' => (float) $data['lng'],
                'last_heading' => isset($data['heading']) ? (float) $data['heading'] : null,
                'last_speed' => isset($data['speed']) ? (float) $data['speed'] : null,
                'last_location_updated_at' => now(),
                'updated_at' => now(),
            ]);

        $driver = $this->driverRow($driverId);

        return response()->json([
            'ok' => true,
            'location' => $this->driverLocationPayloadFromDriver($driver),
        ]);
    }

    private function driverRoutePayload(int $routeId): ?array
    {
        $route = DB::table('routes')->where('id', $routeId)->first();

        if (! $route) {
            return null;
        }

        return $this->driverRoutePayloadFromRows(
            $route,
            $this->driverRouteStopRows($routeId),
        );
    }

    private function driverRoutePayloadFromRows(object $route, $stops): array
    {
        $totalStops = $this->intValue($route->total_stops ?? 0);
        $completedStops = $this->intValue($route->completed_stops ?? 0);
        $stopPayloads = $this->driverRouteStopPayloads($stops);

        return [
            'id' => $this->intValue($route->id),
            'driver_id' => $this->intValue($route->driver_id),
            'driver' => $this->driverPayloadFromRoute($route),
            'driver_location' => $this->driverLocationPayloadFromRoute($route),
            'route_metrics' => $this->routeMetricsPayloadFromRouteRow($route),
            'route_geometry' => $this->routeGeometryPayloadFromRouteRow($route, $stopPayloads),
            'route_date' => $this->dateString($route->route_date ?? null),
            'zone' => $route->zone,
            'status' => $route->status,
            'total_stops' => $totalStops,
            'completed_stops' => $completedStops,
            'progress' => $totalStops > 0 ? (int) round(($completedStops / $totalStops) * 100) : 0,
            'created_at' => $this->dateTimeString($route->created_at ?? null),
            'updated_at' => $this->dateTimeString($route->updated_at ?? null),
            'stops' => $stopPayloads,
        ];
    }

    private function driverRouteStopPayloads($stops): array
    {
        return collect($stops)
            ->filter(fn (object $stop) => $stop->shipment_id !== null)
            ->values()
            ->map(fn (object $stop) => [
                'id' => $this->intValue($stop->stop_id),
                'route_id' => $this->intValue($stop->route_id),
                'shipment_id' => $this->intValue($stop->stop_shipment_id),
                'sort_order' => $this->intValue($stop->sort_order),
                'status' => $stop->stop_status,
                'created_at' => $this->dateTimeString($stop->stop_created_at ?? null),
                'updated_at' => $this->dateTimeString($stop->stop_updated_at ?? null),
                'shipment' => $this->driverShipmentPayloadFromRow($stop),
            ])
            ->all();
    }

    private function driverRouteStopRows(int $routeId)
    {
        $columns = [
            'route_stops.id as stop_id',
            'route_stops.route_id',
            'route_stops.shipment_id as stop_shipment_id',
            'route_stops.sort_order',
            'route_stops.status as stop_status',
            'route_stops.created_at as stop_created_at',
            'route_stops.updated_at as stop_updated_at',
            'shipments.id as shipment_id',
            'shipments.tracking_code',
            'shipments.display_code',
            'shipments.status as shipment_status',
            'shipments.financial_status',
            'shipments.recipient_name',
            'shipments.recipient_phone',
            'shipments.recipient_address',
            'shipments.recipient_zone',
            'shipments.recipient_city',
            'shipments.payment_type',
            'shipments.cod_amount',
            'shipments.shipping_cost',
            'shipments.driver_fee',
            'shipments.notes',
            'shipments.issue_note',
            'shipments.delivery_instructions',
            'shipments.evidence_photo',
            'shipments.evidence_receiver_name',
            'shipments.delivered_at',
            'shipments.created_at as shipment_created_at',
        ];

        foreach ($this->optionalShipmentColumns() as $optionalColumn) {
            if (Schema::hasColumn('shipments', $optionalColumn)) {
                $columns[] = "shipments.{$optionalColumn}";
            }
        }

        return DB::table('route_stops')
            ->leftJoin('shipments', 'shipments.id', '=', 'route_stops.shipment_id')
            ->where('route_stops.route_id', $routeId)
            ->orderBy('route_stops.sort_order')
            ->select($columns)
            ->get();
    }

    private function driverShipmentPayloadFromRow(object $shipment): array
    {
        $payload = [
            'id' => $this->intValue($shipment->shipment_id ?? $shipment->id ?? 0),
            'tracking_code' => $shipment->tracking_code,
            'display_code' => $shipment->display_code,
            'status' => $shipment->shipment_status ?? $shipment->status,
            'financial_status' => $shipment->financial_status,
            'recipient_name' => $shipment->recipient_name,
            'recipient_phone' => $shipment->recipient_phone,
            'recipient_address' => $shipment->recipient_address,
            'recipient_zone' => $shipment->recipient_zone,
            'recipient_city' => $shipment->recipient_city,
            'payment_type' => $shipment->payment_type,
            'cod_amount' => $this->nullableInt($shipment->cod_amount ?? null),
            'shipping_cost' => $this->nullableInt($shipment->shipping_cost ?? null),
            'driver_fee' => $this->nullableInt($shipment->driver_fee ?? null),
            'notes' => $shipment->notes,
            'issue_note' => $shipment->issue_note ?? null,
            'delivery_instructions' => $shipment->delivery_instructions,
            'intake_photo' => $shipment->intake_photo ?? null,
            'evidence_photo' => $shipment->evidence_photo ?? null,
            'evidence_receiver_name' => $shipment->evidence_receiver_name ?? null,
            'recipient_lat' => $this->nullableFloat($shipment->recipient_lat ?? null),
            'recipient_lng' => $this->nullableFloat($shipment->recipient_lng ?? null),
            'delivered_at' => $this->dateTimeString($shipment->delivered_at ?? null),
            'created_at' => $this->dateTimeString($shipment->shipment_created_at ?? $shipment->created_at ?? null),
        ];

        foreach (['cod_collected_amount', 'cod_payment_method', 'cod_collected_at'] as $optionalColumn) {
            if (property_exists($shipment, $optionalColumn)) {
                $payload[$optionalColumn] = $optionalColumn === 'cod_collected_amount'
                    ? $this->nullableInt($shipment->{$optionalColumn})
                    : $shipment->{$optionalColumn};
            }
        }

        return $payload;
    }

    private function optionalShipmentColumns(): array
    {
        return [
            'intake_photo',
            'recipient_lat',
            'recipient_lng',
            'cod_collected_amount',
            'cod_payment_method',
            'cod_collected_at',
        ];
    }

    private function findDriverNavigableRouteRow(int $driverId, string $today): ?object
    {
        return DB::table('routes')
            ->where('driver_id', $driverId)
            ->where(function ($query) use ($today): void {
                $query
                    ->where('status', 'active')
                    ->orWhere(function ($plannedQuery) use ($today): void {
                        $plannedQuery
                            ->where('status', 'planned')
                            ->whereDate('route_date', $today);
                    });
            })
            ->orderByRaw("CASE WHEN status = 'active' THEN 0 ELSE 1 END")
            ->orderByDesc('route_date')
            ->orderByDesc('id')
            ->first();
    }

    private function driverRouteDayRows(int $driverId, string $today)
    {
        return DB::table('routes')
            ->where('driver_id', $driverId)
            ->whereDate('route_date', $today)
            ->orderByRaw("CASE WHEN status = 'active' THEN 0 WHEN status = 'planned' THEN 1 ELSE 2 END")
            ->orderBy('id')
            ->get();
    }

    private function driverRouteDayPayload($routeRows): ?array
    {
        $routeRows = collect($routeRows)->values();

        if ($routeRows->isEmpty()) {
            return null;
        }

        $primaryRoute = $routeRows->firstWhere('status', 'active')
            ?? $routeRows->firstWhere('status', 'planned')
            ?? $routeRows->sortByDesc('id')->first();

        $totalStops = $routeRows->sum(fn (object $route) => $this->intValue($route->total_stops ?? 0));
        $completedStops = $routeRows->sum(fn (object $route) => $this->intValue($route->completed_stops ?? 0));

        $stopsByRoute = [];
        $allStops = [];

        foreach ($routeRows as $routeRow) {
            $stopPayloads = $this->driverRouteStopPayloads($this->driverRouteStopRows((int) $routeRow->id));
            $stopsByRoute[(int) $routeRow->id] = $stopPayloads;
            $allStops = [...$allStops, ...$stopPayloads];
        }

        $aggregatedMetrics = $this->aggregateRouteDayMetricsPayload($routeRows, $stopsByRoute);

        return [
            'id' => $this->intValue($primaryRoute->id ?? 0),
            'route_date' => $this->dateString($primaryRoute->route_date ?? null),
            'zone' => $primaryRoute->zone ?? null,
            'status' => $this->aggregateRouteDayStatus($routeRows),
            'total_stops' => $totalStops,
            'completed_stops' => $completedStops,
            'pending_stops' => max($totalStops - $completedStops, 0),
            'progress' => $totalStops > 0 ? (int) round(($completedStops / $totalStops) * 100) : 0,
            'route_metrics' => $aggregatedMetrics,
            'stops' => $allStops,
        ];
    }

    private function aggregateRouteDayMetricsPayload($routeRows, array $stopsByRoute): array
    {
        $totalDistanceMeters = 0;
        $totalDurationSeconds = 0;
        $sources = [];

        foreach (collect($routeRows) as $routeRow) {
            $persisted = $this->routeMetricsPayloadFromRouteRow($routeRow);

            if ($persisted && $persisted['total_distance_meters'] !== null) {
                $totalDistanceMeters += (int) $persisted['total_distance_meters'];
                $totalDurationSeconds += (int) ($persisted['total_duration_seconds'] ?? 0);
                $sources[] = $persisted['optimization_source'] ?? 'persisted_route';
                continue;
            }

            $computed = $this->routeMetricsFromStops(
                $stopsByRoute[(int) $routeRow->id] ?? [],
                $this->routeOriginFromRouteRow($routeRow),
                'sequence_fallback',
            );

            $totalDistanceMeters += (int) ($computed['distance_meters'] ?? 0);
            $totalDurationSeconds += (int) ($computed['duration_seconds'] ?? 0);
            $sources[] = $computed['source'] ?? 'sequence_fallback';
        }

        $sources = array_values(array_unique(array_filter($sources)));
        $source = count($sources) === 1 ? $sources[0] : 'route_day_aggregate';

        return [
            'total_distance_meters' => $totalDistanceMeters,
            'total_duration_seconds' => $totalDurationSeconds,
            'total_distance_km' => round($totalDistanceMeters / 1000, 1),
            'total_duration_min' => (int) round($totalDurationSeconds / 60),
            'remaining_distance_meters' => null,
            'remaining_duration_seconds' => null,
            'remaining_distance_km' => null,
            'remaining_duration_min' => null,
            'optimization_source' => $source,
            'optimized_at' => null,
            'origin_lat' => null,
            'origin_lng' => null,
        ];
    }

    private function aggregateRouteDayStatus($routeRows): string
    {
        $statuses = collect($routeRows)->pluck('status');

        if ($statuses->contains('active')) {
            return 'active';
        }

        if ($statuses->contains('planned')) {
            return 'planned';
        }

        return 'completed';
    }

    private function driverOperationalFlags(?array $routePayload, ?array $routeDayPayload, int $assignedCount): array
    {
        $hasNavigableStops = collect($routePayload['stops'] ?? [])->isNotEmpty();
        $routeDayStatus = $routeDayPayload['status'] ?? null;

        return [
            'has_route_day' => $routeDayPayload !== null,
            'has_navigable_route' => $routePayload !== null,
            'has_navigable_stops' => $hasNavigableStops,
            'has_assigned_shipments' => $assignedCount > 0,
            'can_create_or_extend_route' => $assignedCount > 0,
            'can_resume_completed_day' => $routeDayStatus === 'completed' && $assignedCount > 0,
        ];
    }

    private function driverOperationalSummary(?array $routePayload, ?array $routeDayPayload, int $assignedCount): array
    {
        $routeDayStops = collect($routeDayPayload['stops'] ?? []);
        $pendingStops = collect($routePayload['stops'] ?? [])->where('status', 'pending')->values();
        $routeDayMetrics = $this->routeDayMetricsForSummary($routeDayPayload, $routeDayStops);
        $remainingMetrics = $this->remainingRouteMetricsForSummary($routePayload, $pendingStops);
        $codCollectedToday = $routeDayStops
            ->where('status', 'completed')
            ->filter(fn (array $stop) => ($stop['shipment']['payment_type'] ?? null) === 'cash_on_delivery')
            ->sum(fn (array $stop) => (int) ($stop['shipment']['cod_collected_amount'] ?? $stop['shipment']['cod_amount'] ?? 0));

        return [
            'total_stops' => $this->intValue($routeDayPayload['total_stops'] ?? 0),
            'completed_stops' => $this->intValue($routeDayPayload['completed_stops'] ?? 0),
            'pending_stops' => $pendingStops->count(),
            'assigned_shipments_count' => $assignedCount,
            'stops_with_coordinates' => $routeDayMetrics['stops_with_coordinates'],
            'missing_geo_stops' => $routeDayMetrics['missing_geo_stops'],
            'cod_collected_today' => $codCollectedToday,
            'total_distance_km' => $routeDayMetrics['distance_km'],
            'total_duration_min' => $routeDayMetrics['duration_min'],
            'remaining_distance_km' => $remainingMetrics['distance_km'],
            'remaining_duration_min' => $remainingMetrics['duration_min'],
            'source' => $routeDayMetrics['source'],
        ];
    }

    private function driverOperationalNavigation(?array $routePayload): array
    {
        $pendingStops = collect($routePayload['stops'] ?? [])
            ->where('status', 'pending')
            ->sortBy('sort_order')
            ->values();

        $currentStopId = $pendingStops->first()['id'] ?? null;
        $nextStopId = $pendingStops->skip(1)->first()['id'] ?? null;

        return [
            'current_stop_id' => $currentStopId,
            'next_stop_id' => $nextStopId,
            'focused_stop_id' => $currentStopId,
        ];
    }

    private function driverOperationalMessage(?array $routePayload, ?array $routeDayPayload, int $assignedCount): string
    {
        if ($routePayload && collect($routePayload['stops'] ?? [])->isNotEmpty()) {
            return 'Tu ruta del dia esta lista.';
        }

        if ($assignedCount > 0) {
            return 'Tienes paquetes asignados listos para enrutar.';
        }

        if ($routeDayPayload && ($routeDayPayload['status'] ?? null) === 'completed') {
            return 'Tu jornada de hoy ya fue completada.';
        }

        return 'No tienes ruta asignada para hoy.';
    }

    private function routeDayMetricsForSummary(?array $routePayload, $stops): array
    {
        $persisted = data_get($routePayload, 'route_metrics');

        if ($persisted && data_get($persisted, 'total_distance_km') !== null) {
            return [
                'distance_km' => (float) data_get($persisted, 'total_distance_km', 0),
                'duration_min' => $this->intValue(data_get($persisted, 'total_duration_min', 0)),
                'stops_with_coordinates' => $this->routeStopsWithCoordinates($stops),
                'missing_geo_stops' => max(collect($stops)->count() - $this->routeStopsWithCoordinates($stops), 0),
                'source' => data_get($persisted, 'optimization_source', 'persisted_route'),
            ];
        }

        return $this->routeMetricsFromStops($stops, $this->routeOriginFromPayload($routePayload), 'sequence_fallback');
    }

    private function remainingRouteMetricsForSummary(?array $routePayload, $pendingStops): array
    {
        $persisted = data_get($routePayload, 'route_metrics');

        if ($persisted && data_get($persisted, 'remaining_distance_km') !== null) {
            return [
                'distance_km' => (float) data_get($persisted, 'remaining_distance_km', 0),
                'duration_min' => $this->intValue(data_get($persisted, 'remaining_duration_min', 0)),
                'stops_with_coordinates' => $this->routeStopsWithCoordinates($pendingStops),
                'missing_geo_stops' => max(collect($pendingStops)->count() - $this->routeStopsWithCoordinates($pendingStops), 0),
                'source' => data_get($persisted, 'optimization_source', 'persisted_route'),
            ];
        }

        return $this->routeMetricsFromStops($pendingStops, $this->routeOriginFromPayload($routePayload), 'sequence_fallback');
    }

    private function routeMetricsFromStops($stops, ?array $origin = null, string $source = 'sequence_fallback'): array
    {
        $orderedStops = collect($stops)
            ->filter(fn ($stop) => $this->stopHasCoordinates($stop))
            ->sortBy('sort_order')
            ->values();
        $missingGeoStops = collect($stops)->count() - $orderedStops->count();

        if ($orderedStops->isEmpty()) {
            return [
                'distance_km' => 0.0,
                'duration_min' => 0,
                'distance_meters' => 0,
                'duration_seconds' => 0,
                'stops_with_coordinates' => 0,
                'missing_geo_stops' => $missingGeoStops,
                'source' => $source,
            ];
        }

        $distanceMeters = 0.0;

        if ($origin && $this->pointHasCoordinates($origin)) {
            $distanceMeters += $this->haversineMeters(
                $origin,
                $this->stopCoordinates($orderedStops[0]),
            );
        }

        for ($index = 0; $index < $orderedStops->count() - 1; $index++) {
            $distanceMeters += $this->haversineMeters(
                $this->stopCoordinates($orderedStops[$index]),
                $this->stopCoordinates($orderedStops[$index + 1]),
            );
        }

        $durationSeconds = (int) round($distanceMeters / 8.33);

        return [
            'distance_km' => round($distanceMeters / 1000, 1),
            'duration_min' => (int) round($durationSeconds / 60),
            'distance_meters' => (int) round($distanceMeters),
            'duration_seconds' => $durationSeconds,
            'stops_with_coordinates' => $orderedStops->count(),
            'missing_geo_stops' => $missingGeoStops,
            'source' => $source,
        ];
    }

    private function routeStopsWithCoordinates($stops): int
    {
        return collect($stops)->filter(fn ($stop) => $this->stopHasCoordinates($stop))->count();
    }

    private function pointHasCoordinates(?array $point): bool
    {
        if (! $point) {
            return false;
        }

        return isset($point['lat'], $point['lng'])
            && is_numeric($point['lat'])
            && is_numeric($point['lng']);
    }

    private function routeOriginFromPayload(?array $routePayload): ?array
    {
        $lat = data_get($routePayload, 'route_metrics.origin_lat');
        $lng = data_get($routePayload, 'route_metrics.origin_lng');

        if (! is_numeric($lat) || ! is_numeric($lng)) {
            return null;
        }

        return [
            'lat' => (float) $lat,
            'lng' => (float) $lng,
        ];
    }

    private function routeOriginFromRouteRow($route): ?array
    {
        if (! $route || ! $this->routeMetricColumnsAvailable()) {
            return null;
        }

        if (! is_numeric($route->origin_lat ?? null) || ! is_numeric($route->origin_lng ?? null)) {
            return null;
        }

        return [
            'lat' => (float) $route->origin_lat,
            'lng' => (float) $route->origin_lng,
        ];
    }

    private function routeMetricColumnsAvailable(): bool
    {
        static $available = null;

        if ($available !== null) {
            return $available;
        }

        $available = Schema::hasColumn('routes', 'optimized_distance_meters')
            && Schema::hasColumn('routes', 'optimized_duration_seconds')
            && Schema::hasColumn('routes', 'remaining_distance_meters')
            && Schema::hasColumn('routes', 'remaining_duration_seconds')
            && Schema::hasColumn('routes', 'optimization_source')
            && Schema::hasColumn('routes', 'optimized_at')
            && Schema::hasColumn('routes', 'origin_lat')
            && Schema::hasColumn('routes', 'origin_lng');

        return $available;
    }

    private function routeMetricsPayloadFromRouteRow(object $route): ?array
    {
        if (! $this->routeMetricColumnsAvailable()) {
            return null;
        }

        $totalDistanceMeters = $this->nullableInt($route->optimized_distance_meters ?? null);
        $totalDurationSeconds = $this->nullableInt($route->optimized_duration_seconds ?? null);
        $remainingDistanceMeters = $this->nullableInt($route->remaining_distance_meters ?? null);
        $remainingDurationSeconds = $this->nullableInt($route->remaining_duration_seconds ?? null);

        if ($totalDistanceMeters === null && $remainingDistanceMeters === null) {
            return null;
        }

        return [
            'total_distance_meters' => $totalDistanceMeters,
            'total_duration_seconds' => $totalDurationSeconds,
            'total_distance_km' => $totalDistanceMeters !== null ? round($totalDistanceMeters / 1000, 1) : null,
            'total_duration_min' => $totalDurationSeconds !== null ? (int) round($totalDurationSeconds / 60) : null,
            'remaining_distance_meters' => $remainingDistanceMeters,
            'remaining_duration_seconds' => $remainingDurationSeconds,
            'remaining_distance_km' => $remainingDistanceMeters !== null ? round($remainingDistanceMeters / 1000, 1) : null,
            'remaining_duration_min' => $remainingDurationSeconds !== null ? (int) round($remainingDurationSeconds / 60) : null,
            'optimization_source' => $route->optimization_source ?? null,
            'optimized_at' => $this->dateTimeString($route->optimized_at ?? null),
            'origin_lat' => $this->nullableFloat($route->origin_lat ?? null),
            'origin_lng' => $this->nullableFloat($route->origin_lng ?? null),
        ];
    }

    private function routeGeometryColumnsAvailable(): bool
    {
        static $available = null;

        if ($available !== null) {
            return $available;
        }

        $available = Schema::hasColumn('routes', 'overview_polyline')
            && Schema::hasColumn('routes', 'route_legs');

        return $available;
    }

    private function routeGeometryPayloadFromRouteRow(object $route, array $stops): ?array
    {
        if (! $this->routeGeometryColumnsAvailable()) {
            return null;
        }

        $legs = $this->decodeRouteLegsPayload($route->route_legs ?? null);
        $overviewPolyline = $route->overview_polyline ?? null;

        if ($overviewPolyline === null && $legs === []) {
            return null;
        }

        $stopsById = collect($stops)->keyBy('id');

        return [
            'overview_polyline' => $overviewPolyline,
            'source' => $route->optimization_source ?? null,
            'legs' => collect($legs)->map(function (array $leg) use ($stopsById) {
                $stopId = $this->intValue($leg['stop_id'] ?? 0);
                $stop = $stopsById->get($stopId);

                return [
                    'stop_id' => $stopId,
                    'sort_order' => $this->intValue(data_get($stop, 'sort_order', 0)),
                    'status' => data_get($stop, 'status'),
                    'distance_meters' => $this->intValue($leg['distance_meters'] ?? 0),
                    'duration_seconds' => $this->intValue($leg['duration_seconds'] ?? 0),
                    'distance_km' => round($this->intValue($leg['distance_meters'] ?? 0) / 1000, 1),
                    'duration_min' => (int) round($this->intValue($leg['duration_seconds'] ?? 0) / 60),
                    'encoded_polyline' => $leg['encoded_polyline'] ?? null,
                ];
            })->values()->all(),
        ];
    }

    private function decodeRouteLegsPayload(mixed $payload): array
    {
        if (is_array($payload)) {
            return $payload;
        }

        if (! is_string($payload) || trim($payload) === '') {
            return [];
        }

        $decoded = json_decode($payload, true);

        return is_array($decoded) ? $decoded : [];
    }

    private function persistRouteGeometrySnapshot(Route $route, array $geometry): void
    {
        if (! $this->routeGeometryColumnsAvailable()) {
            return;
        }

        $route->update([
            'overview_polyline' => $geometry['overview_polyline'] ?? null,
            'route_legs' => $geometry['legs'] ?? [],
        ]);
    }

    private function clearPersistedRouteGeometry(Route $route): void
    {
        if (! $this->routeGeometryColumnsAvailable()) {
            return;
        }

        $route->update([
            'overview_polyline' => null,
            'route_legs' => null,
        ]);
    }

    private function syncPersistedRouteGeometrySnapshot(Route $route, ?array $preferredOrigin = null): void
    {
        if (! $this->routeGeometryColumnsAvailable()) {
            return;
        }

        $route = $route->fresh();
        if (! $route) {
            return;
        }

        $origin = $this->routeOriginFromRouteRow($route) ?? $preferredOrigin;
        if (! $this->pointHasCoordinates($origin)) {
            $this->clearPersistedRouteGeometry($route);
            return;
        }

        $orderedGeoStops = $route->stops()
            ->whereIn('status', ['pending', 'completed'])
            ->with('shipment')
            ->get()
            ->filter(fn ($stop) => $stop->shipment && $stop->shipment->recipient_lat && $stop->shipment->recipient_lng)
            ->sortBy('sort_order')
            ->values();

        if ($orderedGeoStops->isEmpty()) {
            $this->clearPersistedRouteGeometry($route);
            return;
        }

        $geometry = app(RouteOptimizationService::class)->traceOrderedRoute($origin, $orderedGeoStops);
        $this->persistRouteGeometrySnapshot($route, $geometry);
    }

    private function lastCompletedStopCoordinates($stops): ?array
    {
        $lastCompleted = collect($stops)
            ->where('status', 'completed')
            ->filter(fn ($stop) => $this->stopHasCoordinates($stop))
            ->sortBy('sort_order')
            ->last();

        return $lastCompleted ? $this->stopCoordinates($lastCompleted) : null;
    }

    private function syncPersistedRouteMetricsSnapshot(
        Route $route,
        ?array $preferredOrigin = null,
        ?string $preferredSource = null,
        ?array $totalOverride = null,
        bool $keepStoredTotal = false,
    ): void {
        if (! $this->routeMetricColumnsAvailable()) {
            return;
        }

        $route = $route->fresh();
        if (! $route) {
            return;
        }

        $allStops = $route->stops()->with('shipment')->get()->sortBy('sort_order')->values();
        $pendingStops = $allStops->where('status', 'pending')->values();
        $origin = $this->routeOriginFromRouteRow($route) ?? $preferredOrigin;
        $remainingOrigin = $this->lastCompletedStopCoordinates($allStops) ?? $origin;
        $source = $preferredSource ?? ($route->optimization_source ?: 'sequence_fallback');

        $totalMetrics = $totalOverride
            ? [
                'distance_meters' => (int) ($totalOverride['distance_meters'] ?? 0),
                'duration_seconds' => (int) ($totalOverride['duration_seconds'] ?? 0),
            ]
            : null;

        if (! $totalMetrics && $keepStoredTotal && $route->optimized_distance_meters !== null && $route->optimized_duration_seconds !== null) {
            $totalMetrics = [
                'distance_meters' => (int) $route->optimized_distance_meters,
                'duration_seconds' => (int) $route->optimized_duration_seconds,
            ];
        }

        if (! $totalMetrics) {
            $computedTotal = $this->routeMetricsFromStops($allStops, $origin, $source);
            $totalMetrics = [
                'distance_meters' => $computedTotal['distance_meters'],
                'duration_seconds' => $computedTotal['duration_seconds'],
            ];
        }

        $computedRemaining = $this->routeMetricsFromStops($pendingStops, $remainingOrigin, $source);

        $route->update([
            'optimized_distance_meters' => $totalMetrics['distance_meters'],
            'optimized_duration_seconds' => $totalMetrics['duration_seconds'],
            'remaining_distance_meters' => $computedRemaining['distance_meters'],
            'remaining_duration_seconds' => $computedRemaining['duration_seconds'],
            'optimization_source' => $source,
            'optimized_at' => now(),
            'origin_lat' => $origin['lat'] ?? null,
            'origin_lng' => $origin['lng'] ?? null,
        ]);
    }

    private function stopHasCoordinates($stop): bool
    {
        $lat = data_get($stop, 'shipment.recipient_lat');
        $lng = data_get($stop, 'shipment.recipient_lng');

        return is_numeric($lat) && is_numeric($lng);
    }

    private function stopCoordinates($stop): array
    {
        return [
            'lat' => (float) data_get($stop, 'shipment.recipient_lat', 0),
            'lng' => (float) data_get($stop, 'shipment.recipient_lng', 0),
        ];
    }

    private function haversineMeters(array $pointA, array $pointB): float
    {
        $earthRadius = 6371000;
        $latA = deg2rad($pointA['lat']);
        $latB = deg2rad($pointB['lat']);
        $deltaLat = deg2rad($pointB['lat'] - $pointA['lat']);
        $deltaLng = deg2rad($pointB['lng'] - $pointA['lng']);

        $h = sin($deltaLat / 2) ** 2
            + cos($latA) * cos($latB) * sin($deltaLng / 2) ** 2;

        return 2 * $earthRadius * asin(sqrt($h));
    }

    private function driverPayloadFromRoute(object $route): ?array
    {
        $driver = $this->driverRow((int) $route->driver_id);

        if (! $driver) {
            return null;
        }

        return [
            'id' => $this->intValue($driver->id),
            'name' => $driver->name,
            'initials' => $driver->initials,
            'phone' => $driver->phone,
            'vehicle' => $driver->vehicle,
            'plate' => $driver->plate,
            'zone' => $driver->zone,
            'status' => $driver->status,
            'per_package_rate' => $this->nullableInt($driver->per_package_rate ?? null),
            'daily_rate' => $this->nullableInt($driver->daily_rate ?? null),
        ];
    }

    private function driverLocationPayloadFromRoute(object $route): ?array
    {
        return $this->driverLocationPayloadFromDriver(
            $this->driverRow((int) $route->driver_id)
        );
    }

    private function driverLocationPayloadFromDriver(?object $driver): ?array
    {
        if (! $driver || ! $this->driverLocationColumnsAvailable()) {
            return null;
        }

        $lat = $this->nullableFloat($driver->last_lat ?? null);
        $lng = $this->nullableFloat($driver->last_lng ?? null);

        if ($lat === null || $lng === null) {
            return null;
        }

        $updatedAt = $this->dateTimeString($driver->last_location_updated_at ?? null);
        $ageSeconds = null;
        if ($updatedAt) {
            $timestamp = strtotime($updatedAt);
            $ageSeconds = $timestamp !== false ? max(time() - $timestamp, 0) : null;
        }

        return [
            'lat' => $lat,
            'lng' => $lng,
            'heading' => $this->nullableFloat($driver->last_heading ?? null),
            'speed' => $this->nullableFloat($driver->last_speed ?? null),
            'updated_at' => $updatedAt,
            'age_seconds' => $ageSeconds,
            'freshness' => $ageSeconds !== null && $ageSeconds <= 180 ? 'live' : 'stale',
        ];
    }

    private function driverRow(int $driverId): ?object
    {
        if ($driverId <= 0) {
            return null;
        }

        return DB::table('drivers')->where('id', $driverId)->first();
    }

    private function driverLocationColumnsAvailable(): bool
    {
        return Schema::hasColumn('drivers', 'last_lat')
            && Schema::hasColumn('drivers', 'last_lng')
            && Schema::hasColumn('drivers', 'last_heading')
            && Schema::hasColumn('drivers', 'last_speed')
            && Schema::hasColumn('drivers', 'last_location_updated_at');
    }

    private function dateString($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return substr((string) $value, 0, 10);
    }

    private function dateTimeString($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (string) $value;
    }

    private function intValue($value): int
    {
        return is_numeric($value) ? (int) $value : 0;
    }

    private function nullableInt($value): ?int
    {
        return is_numeric($value) ? (int) $value : null;
    }

    private function nullableFloat($value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }

    public function assignedShipments(Request $request): JsonResponse
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);

        if ($driverId <= 0) {
            return response()->json(['error' => 'Acceso denegado'], 403);
        }

        return response()->json([
            'data' => $this->availableShipmentRowsForDriver($driverId)
                ->map(fn (object $shipment) => $this->driverShipmentPayloadFromRow($shipment))
                ->values(),
        ]);
    }

    public function createSmartRoute(Request $request, RouteOptimizationService $optimizer): JsonResponse
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);

        if ($driverId <= 0) {
            return response()->json(['error' => 'Acceso denegado'], 403);
        }

        $data = $request->validate([
            'shipment_ids' => ['required', 'array', 'min:1', 'max:100'],
            'shipment_ids.*' => ['integer', 'exists:shipments,id'],
            'driver_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'driver_lng' => ['nullable', 'numeric', 'between:-180,180'],
        ]);

        $result = $this->createOrAppendRoute(
            driverId: $driverId,
            shipmentIds: $data['shipment_ids'],
            date: now()->toDateString(),
            zone: null,
            activate: true,
            optimizer: $optimizer,
            origin: $this->originFromRequest($data),
            enforceAssignedDriver: true,
            actorUserId: (int) ($request->user()?->id ?? 0),
        );

        return response()->json($result, 201);
    }

    /**
     * Listar rutas del dia (o fecha especifica).
     *
     * GET /api/routes?date=2026-05-13&driver_id=1
     */
    public function index(Request $request): JsonResponse
    {
        if ($response = $this->denyClientRouteAccess($request)) {
            return $response;
        }

        $filters = $request->validate([
            'date' => ['nullable', 'date'],
            'driver_id' => ['nullable', 'integer', 'exists:drivers,id'],
        ]);

        $date = $filters['date'] ?? now()->toDateString();
        $scopedDriverId = (int) $request->attributes->get('_scoped_driver_id', 0);

        $query = DB::table('routes')->whereDate('route_date', $date);

        if ($scopedDriverId > 0) {
            $query->where('driver_id', $scopedDriverId);
        } elseif (! empty($filters['driver_id'])) {
            $query->where('driver_id', $filters['driver_id']);
        }

        $routes = $query
            ->orderBy('id')
            ->pluck('id')
            ->map(fn ($routeId) => $this->driverRoutePayload((int) $routeId))
            ->filter()
            ->values();

        return response()->json($routes);
    }

    /**
     * Crear ruta diaria para un conductor.
     *
     * POST /api/routes
     * { driver_id, date?, zone?, shipment_ids: [1,2,3] }
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:drivers,id',
            'date' => 'date',
            'zone' => 'nullable|string|max:60',
            'shipment_ids' => 'required|array|min:1',
            'shipment_ids.*' => 'exists:shipments,id',
            'driver_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'driver_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'activate' => ['nullable', 'boolean'],
        ]);

        $date = $data['date'] ?? now()->toDateString();

        $result = $this->createOrAppendRoute(
            driverId: (int) $data['driver_id'],
            shipmentIds: $data['shipment_ids'],
            date: $date,
            zone: $data['zone'] ?? null,
            activate: (bool) ($data['activate'] ?? false),
            optimizer: app(RouteOptimizationService::class),
            origin: $this->originFromRequest($data),
            actorUserId: (int) ($request->user()?->id ?? 0),
            enforceAssignedDriver: false,
        );

        return response()->json($result['route'], 201);
    }

    /**
     * Ver ruta con detalle completo.
     *
     * GET /api/routes/{route}
     */
    public function show(Request $request, Route $route): JsonResponse
    {
        if ($response = $this->denyClientRouteAccess($request)) {
            return $response;
        }

        if ($response = $this->denyRouteOutsideScope($request, $route)) {
            return $response;
        }

        return response()->json($this->driverRoutePayload((int) $route->id));
    }

    /**
     * Activar ruta (pasar de planned a active).
     *
     * POST /api/routes/{route}/start
     */
    public function start(Request $request, Route $route): JsonResponse
    {
        if ($response = $this->denyClientRouteAccess($request)) {
            return $response;
        }

        if ($response = $this->denyRouteOutsideScope($request, $route)) {
            return $response;
        }

        if ($route->status !== 'planned') {
            return response()->json(['message' => 'Solo se pueden activar rutas planificadas'], 422);
        }

        DB::transaction(function () use ($route) {
            $route->update(['status' => 'active']);

            $shipmentIds = $route->stops()->pluck('shipment_id');
            Shipment::whereIn('id', $shipmentIds)
                ->whereIn('status', ['registered', 'confirmed', 'pickup_scheduled', 'picked_up', 'in_warehouse', 'assigned_to_route'])
                ->update(['status' => 'in_transit']);
        });

        $this->syncDriverRoutingStatus((int) $route->driver_id);

        return response()->json(['message' => 'Ruta activada', 'status' => 'active']);
    }

    /**
     * Finalizar la salida actual y devolver paquetes no completados a la bandeja del piloto.
     *
     * POST /api/routes/{route}/finalize
     */
    public function finalize(Request $request, Route $route): JsonResponse
    {
        if ($response = $this->denyClientRouteAccess($request)) {
            return $response;
        }

        if ($response = $this->denyRouteOutsideScope($request, $route)) {
            return $response;
        }

        if (! in_array($route->status, ['planned', 'active'], true)) {
            return response()->json(['message' => 'Solo se pueden finalizar rutas abiertas.'], 422);
        }

        $result = DB::transaction(function () use ($request, $route) {
            $route = $route->fresh();
            $pendingStops = $route->stops()
                ->with('shipment')
                ->where('status', '!=', 'completed')
                ->get();

            foreach ($pendingStops as $stop) {
                $shipment = $stop->shipment;
                if (! $shipment) {
                    continue;
                }

                $fromStatus = $shipment->getRawOriginal('status') ?: ($shipment->status?->value ?? null);

                if (! in_array($fromStatus, ['delivered', 'returned', 'cancelled'], true)) {
                    if ($fromStatus !== ShipmentStatus::ASSIGNED_TO_ROUTE->value) {
                        $shipment->update([
                            'status' => ShipmentStatus::ASSIGNED_TO_ROUTE->value,
                        ]);

                        ShipmentEvent::create([
                            'shipment_id' => $shipment->id,
                            'user_id' => $request->user()->id,
                            'from_status' => $fromStatus,
                            'to_status' => ShipmentStatus::ASSIGNED_TO_ROUTE->value,
                            'description' => 'Paquete devuelto a la bandeja del piloto al finalizar la salida.',
                            'metadata' => [
                                'route_id' => $route->id,
                                'action' => 'route_finalized_return_pending',
                            ],
                            'occurred_at' => now(),
                        ]);
                    }
                }
            }

            $returnedCount = $pendingStops->count();

            if ($returnedCount > 0) {
                RouteStop::whereIn('id', $pendingStops->pluck('id'))->delete();
            }

            $route = $route->fresh();
            $completedCount = (int) $route->stops()->where('status', 'completed')->count();

            if ($completedCount === 0) {
                $routeId = (int) $route->id;
                $driverId = (int) $route->driver_id;
                $route->delete();
                $this->syncDriverRoutingStatus($driverId);

                return [
                    'closed_route_id' => $routeId,
                    'preserved_completed_stops' => 0,
                    'returned_shipments' => $returnedCount,
                    'route_deleted' => true,
                ];
            }

            $route->update([
                'status' => 'completed',
                'total_stops' => $completedCount,
                'completed_stops' => $completedCount,
            ]);

            $this->syncPersistedRouteMetricsSnapshot($route);
            $this->syncPersistedRouteGeometrySnapshot($route);
            $this->syncDriverRoutingStatus((int) $route->driver_id);

            return [
                'closed_route_id' => (int) $route->id,
                'preserved_completed_stops' => $completedCount,
                'returned_shipments' => $returnedCount,
                'route_deleted' => false,
            ];
        });

        $this->logRouteInfo('driver.route.finalized', [
            'route_id' => (int) $result['closed_route_id'],
            'driver_id' => (int) $route->driver_id,
            'actor_user_id' => (int) ($request->user()?->id ?? 0) ?: null,
            'returned_shipments' => (int) $result['returned_shipments'],
            'preserved_completed_stops' => (int) $result['preserved_completed_stops'],
            'route_deleted' => (bool) $result['route_deleted'],
        ]);

        return response()->json([
            'message' => $result['returned_shipments'] > 0
                ? 'Ruta finalizada y paquetes pendientes devueltos a tu bandeja.'
                : 'Ruta finalizada.',
            'closed_route_id' => $result['closed_route_id'],
            'preserved_completed_stops' => $result['preserved_completed_stops'],
            'returned_shipments' => $result['returned_shipments'],
            'route_deleted' => $result['route_deleted'],
        ]);
    }

    /**
     * Completar una parada.
     *
     * POST /api/routes/{route}/stops/{stop}/complete
     */
    public function completeStop(Request $request, Route $route, RouteStop $stop): JsonResponse
    {
        if ($response = $this->denyClientRouteAccess($request)) {
            return $response;
        }

        if ($response = $this->denyRouteOutsideScope($request, $route)) {
            return $response;
        }

        if ($stop->route_id !== $route->id) {
            return response()->json(['message' => 'La parada no pertenece a esta ruta'], 422);
        }

        if ($stop->status === 'completed') {
            return response()->json(['message' => 'La parada ya esta completada'], 422);
        }

        DB::transaction(function () use ($route, $stop) {
            $route->completeStop($stop);

            // Actualizar estado del envío asociado
            if ($stop->shipment->status !== ShipmentStatus::ISSUE) {
                $shipmentUpdates = ['status' => 'delivered', 'delivered_at' => now()];

                if (
                    $stop->shipment->payment_type->value === 'cash_on_delivery'
                    && $stop->shipment->getRawOriginal('financial_status') === 'pending'
                ) {
                    $shipmentUpdates['financial_status'] = 'collected';

                    if (Shipment::supportsCodCollectionFields()) {
                        $shipmentUpdates['cod_collected_amount'] = $stop->shipment->cod_collected_amount ?? (int) $stop->shipment->cod_amount;
                        $shipmentUpdates['cod_collected_at'] = $stop->shipment->cod_collected_at ?? now();
                    }
                }

                $stop->shipment->update($shipmentUpdates);
            }
        });

        $freshRoute = $route->fresh();
        $this->syncPersistedRouteMetricsSnapshot($freshRoute, keepStoredTotal: true);
        $this->syncDriverRoutingStatus((int) $freshRoute->driver_id);
        $freshRoute = $freshRoute->fresh();
        $this->logRouteInfo('driver.route.stop_completed', [
            'route_id' => (int) $freshRoute->id,
            'driver_id' => (int) $freshRoute->driver_id,
            'actor_user_id' => (int) ($request->user()?->id ?? 0) ?: null,
            'stop_id' => (int) $stop->id,
            'shipment_id' => (int) $stop->shipment_id,
            'route_status' => $freshRoute->status,
            'completed_stops' => (int) $freshRoute->completed_stops,
            'total_stops' => (int) $freshRoute->total_stops,
            'progress' => $freshRoute->progress(),
        ]);

        return response()->json([
            'message' => 'Parada completada',
            'progress' => $freshRoute->progress(),
            'route_status' => $freshRoute->status,
        ]);
    }

    /**
     * Reordenar paradas de la ruta.
     *
     * PUT /api/routes/{route}/reorder
     * { stop_ids: [3, 1, 2] }
     */
    public function reorder(Request $request, Route $route): JsonResponse
    {
        $data = $request->validate([
            'stop_ids' => 'required|array',
            'stop_ids.*' => 'exists:route_stops,id',
        ]);

        DB::transaction(function () use ($data, $route) {
            foreach ($data['stop_ids'] as $index => $stopId) {
                RouteStop::where('id', $stopId)
                    ->where('route_id', $route->id)
                    ->update(['sort_order' => $index + 1]);
            }
        });

        $this->syncPersistedRouteMetricsSnapshot($route);
        $this->syncPersistedRouteGeometrySnapshot($route);

        return response()->json(['message' => 'Paradas reordenadas']);
    }

    /**
     * Agregar envio a ruta existente.
     *
     * POST /api/routes/{route}/add-stop
     * { shipment_id }
     */
    public function addStop(Request $request, Route $route): JsonResponse
    {
        $data = $request->validate([
            'shipment_id' => 'required|exists:shipments,id',
        ]);

        if ($route->status === 'completed') {
            return response()->json(['message' => 'No se puede agregar una parada a una ruta completada'], 422);
        }

        $isValidShipment = Shipment::query()
            ->where('id', $data['shipment_id'])
            ->whereNotIn('status', ['delivered', 'returned', 'cancelled'])
            ->whereDoesntHave('routeStops')
            ->where(function ($query) use ($route) {
                $query->whereNull('driver_id')->orWhere('driver_id', $route->driver_id);
            })
            ->exists();

        if (! $isValidShipment) {
            throw ValidationException::withMessages([
                'shipment_id' => ['El paquete no pertenece a este piloto, ya esta en una ruta o no se puede enrutar.'],
            ]);
        }

        $maxOrder = $route->stops()->max('sort_order') ?? 0;

        RouteStop::create([
            'route_id' => $route->id,
            'shipment_id' => $data['shipment_id'],
            'sort_order' => $maxOrder + 1,
        ]);

        $route->increment('total_stops');

        // Asignar conductor al envio
        Shipment::where('id', $data['shipment_id'])->update([
            'driver_id' => $route->driver_id,
            'status' => $route->status === 'active' ? 'in_transit' : 'assigned_to_route',
        ]);

        $this->syncPersistedRouteMetricsSnapshot($route);
        $this->syncPersistedRouteGeometrySnapshot($route);

        return response()->json(['message' => 'Parada agregada', 'total_stops' => $route->fresh()->total_stops]);
    }

    public function routableShipments(Request $request): JsonResponse
    {
        if ($response = $this->denyClientRouteAccess($request)) {
            return $response;
        }

        $filters = $request->validate([
            'driver_id' => ['nullable', 'integer', 'exists:drivers,id'],
            'search' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $date = now()->toDateString();
        $scopedDriverId = (int) $request->attributes->get('_scoped_driver_id', 0);
        $targetDriverId = $scopedDriverId > 0
            ? $scopedDriverId
            : (int) ($filters['driver_id'] ?? 0);

        $query = Shipment::with(['driver:id,name,initials'])
            ->whereNotIn('status', ['delivered', 'returned', 'cancelled'])
            ->whereDoesntHave('routeStops', function ($routeStopQuery) use ($date): void {
                $routeStopQuery->whereHas('route', function ($routeQuery) use ($date): void {
                    $this->openOperationalRouteConstraint($routeQuery, $date);
                });
            });

        if ($targetDriverId > 0) {
            $query->where(function ($driverQuery) use ($targetDriverId): void {
                $driverQuery
                    ->whereNull('driver_id')
                    ->orWhere('driver_id', $targetDriverId);
            });
        }

        if ($search = ($filters['search'] ?? null)) {
            $query->where(function ($q) use ($search) {
                $q->where('display_code', 'like', "%{$search}%")
                    ->orWhere('tracking_code', 'like', "%{$search}%")
                    ->orWhere('recipient_name', 'like', "%{$search}%")
                    ->orWhere('recipient_address', 'like', "%{$search}%");
            });
        }

        return response()->json(
            $query->orderBy('created_at')->paginate((int) ($filters['per_page'] ?? 100))
        );
    }

    /**
     * Optimize route stop order using Google Routes API with local fallback.
     *
     * POST /api/routes/{route}/optimize
     * Body: { driver_lat, driver_lng, stop_ids?: int[] }
     */
    public function optimize(Request $request, Route $route): JsonResponse
    {
        if ($response = $this->denyClientRouteAccess($request)) {
            return $response;
        }

        if ($response = $this->denyRouteOutsideScope($request, $route)) {
            return $response;
        }

        $request->validate([
            'driver_lat' => 'required|numeric|between:-90,90',
            'driver_lng' => 'required|numeric|between:-180,180',
            'stop_ids'   => 'sometimes|array',
            'stop_ids.*' => 'integer',
        ]);

        $driverLocation = [
            'lat' => (float) $request->driver_lat,
            'lng' => (float) $request->driver_lng,
        ];

        // Load stops to optimize (selected or all pending)
        $stopsQuery = $route->stops()->where('status', 'pending')->with('shipment');
        if ($request->has('stop_ids') && !empty($request->stop_ids)) {
            $stopsQuery->whereIn('id', $request->stop_ids);
        }
        $allPendingStops = $stopsQuery->get();

        // Separate geocoded vs non-geocoded
        $geoStops = $allPendingStops->filter(fn($s) => $s->shipment->recipient_lat && $s->shipment->recipient_lng);
        $noGeoStops = $allPendingStops->diff($geoStops);

        if ($geoStops->isEmpty()) {
            // Not enough geocoded stops to optimize
            $this->syncPersistedRouteMetricsSnapshot($route, $driverLocation, 'sequence_fallback');
            $this->clearPersistedRouteGeometry($route);
            $this->logRouteInfo('driver.route.optimization_skipped_missing_geo', [
                'route_id' => (int) $route->id,
                'driver_id' => (int) $route->driver_id,
                'actor_user_id' => (int) ($request->user()?->id ?? 0) ?: null,
                'pending_stop_count' => $allPendingStops->count(),
                'geo_stop_count' => $geoStops->count(),
                'missing_geo_stop_count' => $noGeoStops->count(),
            ]);

            return response()->json([
                'route' => $this->driverRoutePayload((int) $route->id),
                'optimization' => [
                    'distance_km' => 0,
                    'duration_min' => 0,
                    'stops_optimized' => $geoStops->count(),
                    'stops_no_geo' => $noGeoStops->count(),
                ],
            ]);
        }

        $service = app(RouteOptimizationService::class);
        try {
            $result = $service->optimize($driverLocation, $geoStops);
        } catch (\Exception $e) {
            Log::warning('Route optimization API failed, using fallback', [
                'error' => $e->getMessage(),
                'route_id' => (int) $route->id,
                'driver_id' => (int) $route->driver_id,
                'pending_stop_count' => $allPendingStops->count(),
                'geo_stop_count' => $geoStops->count(),
            ]);
            $result = $service->optimizeFallback($driverLocation, $geoStops);
        }

        // Reorder in DB: completed stops keep their order, optimized stops get new order, non-geocoded at end
        DB::transaction(function () use ($route, $result, $noGeoStops) {
            // Find highest sort_order of completed stops
            $completedMax = $route->stops()->where('status', 'completed')->max('sort_order') ?? 0;
            $order = $completedMax + 1;

            foreach ($result['stop_ids'] as $stopId) {
                $route->stops()->where('id', $stopId)->update(['sort_order' => $order++]);
            }
            foreach ($noGeoStops as $stop) {
                $stop->update(['sort_order' => $order++]);
            }
        });

        $this->syncPersistedRouteMetricsSnapshot(
            $route,
            $driverLocation,
            $result['source'] ?? 'sequence_fallback',
            [
                'distance_meters' => (int) ($result['distance_meters'] ?? 0),
                'duration_seconds' => (int) ($result['duration_seconds'] ?? 0),
            ]
        );
        $this->persistRouteGeometrySnapshot($route->fresh(), $result);
        $this->logRouteInfo('driver.route.optimized', [
            'route_id' => (int) $route->id,
            'driver_id' => (int) $route->driver_id,
            'actor_user_id' => (int) ($request->user()?->id ?? 0) ?: null,
            'source' => $result['source'] ?? 'sequence_fallback',
            'optimized_stop_count' => count($result['stop_ids'] ?? []),
            'missing_geo_stop_count' => $noGeoStops->count(),
            'distance_meters' => (int) ($result['distance_meters'] ?? 0),
            'duration_seconds' => (int) ($result['duration_seconds'] ?? 0),
        ]);

        return response()->json([
            'route' => $this->driverRoutePayload((int) $route->id),
            'optimization' => [
                'distance_km' => round(($result['distance_meters'] ?? 0) / 1000, 1),
                'duration_min' => round(($result['duration_seconds'] ?? 0) / 60),
                'stops_optimized' => count($result['stop_ids']),
                'stops_no_geo' => $noGeoStops->count(),
            ],
        ]);
    }

    /**
     * Remove a stop from the route (driver unassign).
     *
     * DELETE /api/routes/{route}/stops/{stop}
     */
    public function removeStop(Request $request, Route $route, RouteStop $stop): JsonResponse
    {
        if ($response = $this->denyClientRouteAccess($request)) {
            return $response;
        }

        if ($response = $this->denyRouteOutsideScope($request, $route)) {
            return $response;
        }

        if ($stop->route_id !== $route->id) {
            return response()->json(['error' => 'La parada no pertenece a esta ruta'], 404);
        }
        if ($stop->status === 'completed') {
            return response()->json(['error' => 'No se puede desasignar una parada completada'], 422);
        }

        DB::transaction(function () use ($route, $stop) {
            // Reset shipment status to in_warehouse
            $stop->shipment->update(['status' => 'in_warehouse']);
            $stop->delete();
            $route->decrement('total_stops');
        });

        $this->syncPersistedRouteMetricsSnapshot($route);
        $this->syncPersistedRouteGeometrySnapshot($route);
        $this->logRouteInfo('driver.route.stop_removed', [
            'route_id' => (int) $route->id,
            'driver_id' => (int) $route->driver_id,
            'stop_id' => (int) $stop->id,
            'shipment_id' => (int) $stop->shipment_id,
            'remaining_total_stops' => (int) ($route->fresh()?->total_stops ?? 0),
        ]);

        return response()->json([
            'message' => 'Parada desasignada exitosamente',
            'route' => $this->driverRoutePayload((int) $route->id),
        ]);
    }

    private function availableShipmentRowsForDriver(int $driverId)
    {
        $date = now()->toDateString();

        $columns = [
            'shipments.id',
            'shipments.tracking_code',
            'shipments.display_code',
            'shipments.status',
            'shipments.financial_status',
            'shipments.recipient_name',
            'shipments.recipient_phone',
            'shipments.recipient_address',
            'shipments.recipient_zone',
            'shipments.recipient_city',
            'shipments.payment_type',
            'shipments.cod_amount',
            'shipments.shipping_cost',
            'shipments.driver_fee',
            'shipments.notes',
            'shipments.issue_note',
            'shipments.delivery_instructions',
            'shipments.evidence_photo',
            'shipments.evidence_receiver_name',
            'shipments.delivered_at',
            'shipments.created_at',
        ];

        foreach ($this->optionalShipmentColumns() as $optionalColumn) {
            if (Schema::hasColumn('shipments', $optionalColumn)) {
                $columns[] = "shipments.{$optionalColumn}";
            }
        }

        return DB::table('shipments')
            ->where('shipments.driver_id', $driverId)
            ->whereNotIn('shipments.status', ['delivered', 'returned', 'cancelled'])
            ->whereNotExists(function ($query) use ($driverId, $date): void {
                $query
                    ->select(DB::raw(1))
                    ->from('route_stops')
                    ->join('routes', 'routes.id', '=', 'route_stops.route_id')
                    ->whereColumn('route_stops.shipment_id', 'shipments.id')
                    ->where('routes.driver_id', $driverId)
                    ->where(function ($routeQuery) use ($date): void {
                        $routeQuery
                            ->where('routes.status', 'active')
                            ->orWhere(function ($plannedQuery) use ($date): void {
                                $plannedQuery
                                    ->where('routes.status', 'planned')
                                    ->whereDate('routes.route_date', $date);
                            });
                    });
            })
            ->orderBy('shipments.created_at')
            ->select($columns)
            ->get();
    }

    private function availableShipmentsForDriver(int $driverId)
    {
        $date = now()->toDateString();

        return Shipment::query()
            ->where('driver_id', $driverId)
            ->whereNotIn('status', ['delivered', 'returned', 'cancelled'])
            ->whereDoesntHave('routeStops', fn ($query) => $this->currentOpenRouteStopConstraint($query, $driverId, $date))
            ->orderBy('created_at');
    }

    private function createOrAppendRoute(
        int $driverId,
        array $shipmentIds,
        string $date,
        ?string $zone,
        bool $activate,
        RouteOptimizationService $optimizer,
        ?array $origin,
        int $actorUserId,
        bool $enforceAssignedDriver,
    ): array {
        $shipmentIds = array_values(array_unique(array_map('intval', $shipmentIds)));

        $validQuery = Shipment::query()
            ->whereIn('id', $shipmentIds)
            ->whereNotIn('status', ['delivered', 'returned', 'cancelled'])
            ->whereDoesntHave('routeStops', fn ($query) => $this->currentOpenRouteStopConstraint($query, $driverId, $date));

        if ($enforceAssignedDriver) {
            $validQuery->where('driver_id', $driverId);
        } else {
            $validQuery->where(function ($q) use ($driverId) {
                $q->whereNull('driver_id')->orWhere('driver_id', $driverId);
            });
        }

        $validIds = $validQuery->pluck('id')->all();
        if (count($validIds) !== count($shipmentIds)) {
            throw ValidationException::withMessages([
                'shipment_ids' => ['Uno o mas paquetes no pertenecen al piloto, ya estan en una ruta o no se pueden enrutar.'],
            ]);
        }

        $routeResult = DB::transaction(function () use ($driverId, $date, $zone, $shipmentIds, $activate) {
            $this->detachStaleRouteStops($driverId, $shipmentIds, $date);
            $createdNewRoute = false;
            $reopenedCompletedRoute = false;

            $route = Route::where('driver_id', $driverId)
                ->whereDate('route_date', $date)
                ->whereIn('status', ['planned', 'active'])
                ->first();

            if (! $route) {
                $route = Route::where('driver_id', $driverId)
                    ->whereDate('route_date', $date)
                    ->where('status', 'completed')
                    ->latest('id')
                    ->first();
            }

            if ($route && $route->status === 'completed') {
                $reopenedCompletedRoute = true;
                $route->update([
                    'status' => $activate ? 'active' : 'planned',
                    'zone' => $route->zone ?: $zone,
                    'completed_stops' => $route->stops()->where('status', 'completed')->count(),
                    'total_stops' => $route->stops()->count(),
                ]);
            }

            if (! $route) {
                $createdNewRoute = true;
                $route = Route::create([
                    'driver_id' => $driverId,
                    'route_date' => $date,
                    'zone' => $zone,
                    'status' => $activate ? 'active' : 'planned',
                    'total_stops' => 0,
                    'completed_stops' => 0,
                ]);
            }

            if ($zone && ! $route->zone) {
                $route->update(['zone' => $zone]);
            }

            if ($activate && $route->status === 'planned') {
                $route->update(['status' => 'active']);
            }

            $nextOrder = (int) ($route->stops()->max('sort_order') ?? 0) + 1;

            foreach ($shipmentIds as $shipmentId) {
                RouteStop::create([
                    'route_id' => $route->id,
                    'shipment_id' => $shipmentId,
                    'sort_order' => $nextOrder++,
                    'status' => 'pending',
                ]);
            }

            $route->update(['total_stops' => $route->stops()->count()]);

            Shipment::whereIn('id', $shipmentIds)->update([
                'driver_id' => $driverId,
                'status' => $activate ? 'in_transit' : 'assigned_to_route',
            ]);

            if ($activate) {
                $route->driver?->update(['status' => 'route']);
            }

            return [
                'route' => $route->fresh(),
                'created_new_route' => $createdNewRoute,
                'reopened_completed_route' => $reopenedCompletedRoute,
            ];
        });

        $route = $routeResult['route'];

        if ($activate) {
            $this->syncDriverRoutingStatus($driverId);
        }

        $optimization = $this->optimizePendingStops($route, $optimizer, $origin);
        $this->logRouteInfo('driver.route_day.synced', [
            'driver_id' => $driverId,
            'actor_user_id' => $actorUserId ?: null,
            'route_id' => (int) $route->id,
            'route_date' => $date,
            'shipment_ids' => $shipmentIds,
            'shipment_count' => count($shipmentIds),
            'activate' => $activate,
            'created_new_route' => (bool) $routeResult['created_new_route'],
            'reopened_completed_route' => (bool) $routeResult['reopened_completed_route'],
            'route_status' => $route->status,
            'total_stops' => (int) $route->total_stops,
            'completed_stops' => (int) $route->completed_stops,
            'optimization_distance_km' => $optimization['distance_km'] ?? null,
            'optimization_duration_min' => $optimization['duration_min'] ?? null,
            'optimized_stops' => $optimization['stops_optimized'] ?? null,
            'stops_without_geo' => $optimization['stops_no_geo'] ?? null,
            'origin' => $origin,
        ]);

        return [
            'message' => 'Ruta creada',
            'route' => $this->driverRoutePayload((int) $route->id),
            'optimization' => $optimization,
        ];
    }

    private function currentOpenRouteStopConstraint($query, int $driverId, string $date): void
    {
        $query->whereHas('route', fn ($routeQuery) => $this->currentOpenRouteConstraint($routeQuery, $driverId, $date));
    }

    private function currentOpenRouteConstraint($query, int $driverId, string $date): void
    {
        $query->where('driver_id', $driverId);
        $this->openOperationalRouteConstraint($query, $date);
    }

    private function openOperationalRouteConstraint($query, string $date): void
    {
        $query->where(function ($routeQuery) use ($date): void {
            $routeQuery
                ->where('status', 'active')
                ->orWhere(function ($plannedQuery) use ($date): void {
                    $plannedQuery
                        ->where('status', 'planned')
                        ->whereDate('route_date', $date);
                });
        });
    }

    private function detachStaleRouteStops(int $driverId, array $shipmentIds, string $date): void
    {
        $staleStops = RouteStop::query()
            ->whereIn('shipment_id', $shipmentIds)
            ->whereDoesntHave('route', fn ($query) => $this->currentOpenRouteConstraint($query, $driverId, $date))
            ->get();

        if ($staleStops->isEmpty()) {
            return;
        }

        $affectedRouteIds = $staleStops->pluck('route_id')->unique()->values();

        RouteStop::whereIn('id', $staleStops->pluck('id'))->delete();

        Route::whereIn('id', $affectedRouteIds)->get()->each(function (Route $route) {
            $route->update([
                'total_stops' => $route->stops()->count(),
                'completed_stops' => $route->stops()->where('status', 'completed')->count(),
            ]);
            $this->syncPersistedRouteMetricsSnapshot($route);
            $this->syncPersistedRouteGeometrySnapshot($route);
        });
    }

    private function optimizePendingStops(Route $route, RouteOptimizationService $optimizer, ?array $origin): array
    {
        $pendingStops = $route->stops()->where('status', 'pending')->with('shipment')->get();
        $geoStops = $pendingStops->filter(fn ($s) => $s->shipment->recipient_lat && $s->shipment->recipient_lng);
        $noGeoStops = $pendingStops->diff($geoStops);

        if ($geoStops->isEmpty()) {
            $this->syncPersistedRouteMetricsSnapshot($route, $origin, 'sequence_fallback');
            $this->clearPersistedRouteGeometry($route);
            $this->logRouteInfo('driver.route.smart_route_missing_geo', [
                'route_id' => (int) $route->id,
                'driver_id' => (int) $route->driver_id,
                'pending_stop_count' => $pendingStops->count(),
                'geo_stop_count' => 0,
                'missing_geo_stop_count' => $noGeoStops->count(),
            ]);

            return [
                'distance_km' => 0,
                'duration_min' => 0,
                'stops_optimized' => $geoStops->count(),
                'stops_no_geo' => $noGeoStops->count(),
            ];
        }

        if (! $origin) {
            $computed = $this->routeMetricsFromStops($pendingStops, null, 'sequence_fallback');
            $this->syncPersistedRouteMetricsSnapshot($route, null, 'sequence_fallback', [
                'distance_meters' => $computed['distance_meters'],
                'duration_seconds' => $computed['duration_seconds'],
            ]);
            $this->clearPersistedRouteGeometry($route);
            $this->logRouteInfo('driver.route.smart_route_optimized_without_origin', [
                'route_id' => (int) $route->id,
                'driver_id' => (int) $route->driver_id,
                'pending_stop_count' => $pendingStops->count(),
                'geo_stop_count' => $geoStops->count(),
                'missing_geo_stop_count' => $noGeoStops->count(),
                'distance_meters' => (int) $computed['distance_meters'],
                'duration_seconds' => (int) $computed['duration_seconds'],
            ]);

            return [
                'distance_km' => $computed['distance_km'],
                'duration_min' => $computed['duration_min'],
                'stops_optimized' => $geoStops->count(),
                'stops_no_geo' => $noGeoStops->count(),
            ];
        }

        try {
            $result = $optimizer->optimize($origin, $geoStops);
        } catch (\Exception $e) {
            Log::warning('Route optimization API failed, using fallback', [
                'error' => $e->getMessage(),
                'route_id' => (int) $route->id,
                'driver_id' => (int) $route->driver_id,
                'pending_stop_count' => $pendingStops->count(),
                'geo_stop_count' => $geoStops->count(),
            ]);
            $result = $optimizer->optimizeFallback($origin, $geoStops);
        }

        DB::transaction(function () use ($route, $result, $noGeoStops) {
            $completedMax = $route->stops()->where('status', 'completed')->max('sort_order') ?? 0;
            $order = $completedMax + 1;

            foreach ($result['stop_ids'] as $stopId) {
                $route->stops()->where('id', $stopId)->update(['sort_order' => $order++]);
            }

            foreach ($noGeoStops as $stop) {
                $stop->update(['sort_order' => $order++]);
            }
        });

        $this->syncPersistedRouteMetricsSnapshot(
            $route,
            $origin,
            $result['source'] ?? 'sequence_fallback',
            [
                'distance_meters' => (int) ($result['distance_meters'] ?? 0),
                'duration_seconds' => (int) ($result['duration_seconds'] ?? 0),
            ]
        );
        $this->persistRouteGeometrySnapshot($route->fresh(), $result);

        return [
            'distance_km' => round(($result['distance_meters'] ?? 0) / 1000, 1),
            'duration_min' => round(($result['duration_seconds'] ?? 0) / 60),
            'stops_optimized' => count($result['stop_ids']),
            'stops_no_geo' => $noGeoStops->count(),
        ];
    }

    private function syncDriverRoutingStatus(int $driverId): void
    {
        $hasActiveRoute = Route::query()
            ->where('driver_id', $driverId)
            ->where('status', 'active')
            ->exists();

        DB::table('drivers')
            ->where('id', $driverId)
            ->update([
                'status' => $hasActiveRoute ? 'route' : 'active',
                'updated_at' => now(),
            ]);
    }

    private function originFromRequest(array $data): ?array
    {
        if (! isset($data['driver_lat'], $data['driver_lng'])) {
            return null;
        }

        return [
            'lat' => (float) $data['driver_lat'],
            'lng' => (float) $data['driver_lng'],
        ];
    }

    private function logRouteInfo(string $event, array $context = []): void
    {
        Log::info($event, array_merge([
            'component' => 'driver_route_operations',
            'at' => now()->toIso8601String(),
        ], $context));
    }

    private function denyRouteOutsideScope(Request $request, Route $route): ?JsonResponse
    {
        $scopedDriverId = (int) $request->attributes->get('_scoped_driver_id', 0);

        if ($scopedDriverId > 0 && (int) $route->driver_id !== $scopedDriverId) {
            return response()->json(['error' => 'No puedes acceder a una ruta de otro piloto.'], 403);
        }

        return null;
    }

    private function denyClientRouteAccess(Request $request): ?JsonResponse
    {
        if ((int) $request->attributes->get('_scoped_client_id', 0) > 0) {
            return response()->json(['error' => 'Los clientes deben usar el portal cliente para consultar sus envios.'], 403);
        }

        return null;
    }
}
