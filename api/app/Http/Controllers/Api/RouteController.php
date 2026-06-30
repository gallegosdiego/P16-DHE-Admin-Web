<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
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

        $route = DB::table('routes')
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

        return [
            'id' => $this->intValue($route->id),
            'driver_id' => $this->intValue($route->driver_id),
            'driver' => $this->driverPayloadFromRoute($route),
            'route_date' => $this->dateString($route->route_date ?? null),
            'zone' => $route->zone,
            'status' => $route->status,
            'total_stops' => $totalStops,
            'completed_stops' => $completedStops,
            'progress' => $totalStops > 0 ? (int) round(($completedStops / $totalStops) * 100) : 0,
            'created_at' => $this->dateTimeString($route->created_at ?? null),
            'updated_at' => $this->dateTimeString($route->updated_at ?? null),
            'stops' => collect($stops)
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
                ]),
        ];
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

    private function driverPayloadFromRoute(object $route): ?array
    {
        $driver = DB::table('drivers')->where('id', $route->driver_id)->first();

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

        // Cambiar estado del conductor a "route"
        $route->driver?->update(['status' => 'route']);

        return response()->json(['message' => 'Ruta activada', 'status' => 'active']);
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

        if ($geoStops->count() < 2) {
            // Not enough geocoded stops to optimize
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
            Log::warning('Route optimization API failed, using fallback', ['error' => $e->getMessage()]);
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

        $route = DB::transaction(function () use ($driverId, $date, $zone, $shipmentIds, $activate) {
            $this->detachStaleRouteStops($driverId, $shipmentIds, $date);

            $route = Route::where('driver_id', $driverId)
                ->whereDate('route_date', $date)
                ->whereIn('status', ['planned', 'active'])
                ->first();

            if (! $route) {
                $route = Route::where('driver_id', $driverId)
                    ->whereDate('route_date', $date)
                    ->where('status', 'completed')
                    ->first();

                if ($route) {
                    $route->update([
                        'status' => $activate ? 'active' : 'planned',
                        'total_stops' => $route->stops()->count(),
                        'completed_stops' => $route->stops()->where('status', 'completed')->count(),
                    ]);
                } else {
                    $route = Route::create([
                        'driver_id' => $driverId,
                        'route_date' => $date,
                        'zone' => $zone,
                        'status' => $activate ? 'active' : 'planned',
                        'total_stops' => 0,
                        'completed_stops' => 0,
                    ]);
                }
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

            return $route->fresh();
        });

        $optimization = $this->optimizePendingStops($route, $optimizer, $origin);

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
        });
    }

    private function optimizePendingStops(Route $route, RouteOptimizationService $optimizer, ?array $origin): array
    {
        $pendingStops = $route->stops()->where('status', 'pending')->with('shipment')->get();
        $geoStops = $pendingStops->filter(fn ($s) => $s->shipment->recipient_lat && $s->shipment->recipient_lng);
        $noGeoStops = $pendingStops->diff($geoStops);

        if (! $origin || $geoStops->count() < 2) {
            return [
                'distance_km' => 0,
                'duration_min' => 0,
                'stops_optimized' => $geoStops->count(),
                'stops_no_geo' => $noGeoStops->count(),
            ];
        }

        try {
            $result = $optimizer->optimize($origin, $geoStops);
        } catch (\Exception $e) {
            Log::warning('Route optimization API failed, using fallback', ['error' => $e->getMessage()]);
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

        return [
            'distance_km' => round(($result['distance_meters'] ?? 0) / 1000, 1),
            'duration_min' => round(($result['duration_seconds'] ?? 0) / 60),
            'stops_optimized' => count($result['stop_ids']),
            'stops_no_geo' => $noGeoStops->count(),
        ];
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
