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

        $shipmentColumns = $this->driverShipmentColumns();

        $route = Route::where('driver_id', $driverId)
            ->whereDate('route_date', now()->toDateString())
            ->whereIn('status', ['planned', 'active'])
            ->with(['stops' => function ($query) use ($shipmentColumns) {
                $query->orderBy('sort_order')
                    ->with(['shipment' => fn ($shipmentQuery) => $shipmentQuery->select($shipmentColumns)]);
            }])
            ->first();

        if (! $route) {
            return response()->json([
                'route' => null,
                'message' => 'No tienes ruta asignada para hoy.',
            ]);
        }

        return response()->json([
            'route' => $this->driverRoutePayload($route),
        ]);
    }

    private function driverRoutePayload(Route $route): array
    {
        return [
            'id' => $route->id,
            'driver_id' => $route->driver_id,
            'route_date' => $route->route_date?->toDateString(),
            'zone' => $route->zone,
            'status' => $route->status,
            'total_stops' => $route->total_stops,
            'completed_stops' => $route->completed_stops,
            'created_at' => $route->created_at?->toISOString(),
            'updated_at' => $route->updated_at?->toISOString(),
            'stops' => $route->stops
                ->filter(fn (RouteStop $stop) => $stop->shipment !== null)
                ->values()
                ->map(fn (RouteStop $stop) => [
                    'id' => $stop->id,
                    'route_id' => $stop->route_id,
                    'shipment_id' => $stop->shipment_id,
                    'sort_order' => $stop->sort_order,
                    'status' => $stop->status,
                    'created_at' => $stop->created_at?->toISOString(),
                    'updated_at' => $stop->updated_at?->toISOString(),
                    'shipment' => $this->driverShipmentPayload($stop->shipment),
                ]),
        ];
    }

    private function driverShipmentPayload(Shipment $shipment): array
    {
        $payload = [
            'id' => $shipment->id,
            'display_code' => $shipment->display_code,
            'status' => $shipment->getRawOriginal('status'),
            'recipient_name' => $shipment->recipient_name,
            'recipient_phone' => $shipment->recipient_phone,
            'recipient_address' => $shipment->recipient_address,
            'recipient_zone' => $shipment->recipient_zone,
            'recipient_city' => $shipment->recipient_city,
            'payment_type' => $shipment->getRawOriginal('payment_type'),
            'cod_amount' => $shipment->cod_amount,
            'shipping_cost' => $shipment->shipping_cost,
            'driver_fee' => $shipment->driver_fee,
            'notes' => $shipment->notes,
            'delivery_instructions' => $shipment->delivery_instructions,
            'intake_photo' => $shipment->intake_photo,
            'evidence_photo' => $shipment->evidence_photo,
            'evidence_receiver_name' => $shipment->evidence_receiver_name,
            'recipient_lat' => $shipment->recipient_lat,
            'recipient_lng' => $shipment->recipient_lng,
        ];

        foreach (['cod_collected_amount', 'cod_payment_method', 'cod_collected_at'] as $optionalColumn) {
            if (Schema::hasColumn('shipments', $optionalColumn)) {
                $payload[$optionalColumn] = $shipment->{$optionalColumn};
            }
        }

        return $payload;
    }

    private function driverShipmentColumns(): array
    {
        $columns = [
            'id',
            'display_code',
            'status',
            'recipient_name',
            'recipient_phone',
            'recipient_address',
            'recipient_zone',
            'recipient_city',
            'payment_type',
            'cod_amount',
            'shipping_cost',
            'driver_fee',
            'notes',
            'delivery_instructions',
            'intake_photo',
            'evidence_photo',
            'evidence_receiver_name',
            'recipient_lat',
            'recipient_lng',
        ];

        foreach (['cod_collected_amount', 'cod_payment_method', 'cod_collected_at'] as $optionalColumn) {
            if (Schema::hasColumn('shipments', $optionalColumn)) {
                $columns[] = $optionalColumn;
            }
        }

        return $columns;
    }

    public function assignedShipments(Request $request): JsonResponse
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);

        if ($driverId <= 0) {
            return response()->json(['error' => 'Acceso denegado'], 403);
        }

        return response()->json([
            'data' => $this->availableShipmentsForDriver($driverId)->get(),
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

        $query = Route::with(['driver:id,name,initials,phone,vehicle,plate,zone,status', 'stops.shipment:id,tracking_code,display_code,recipient_name,recipient_address,recipient_zone,status'])
            ->forDate($date);

        if ($scopedDriverId > 0) {
            $query->where('driver_id', $scopedDriverId);
        } elseif (! empty($filters['driver_id'])) {
            $query->where('driver_id', $filters['driver_id']);
        }

        $routes = $query->get()->map(fn (Route $r) => [
            'id' => $r->id,
            'driver' => $r->driver,
            'route_date' => $r->route_date->toDateString(),
            'zone' => $r->zone,
            'status' => $r->status,
            'total_stops' => $r->total_stops,
            'completed_stops' => $r->completed_stops,
            'progress' => $r->progress(),
            'stops' => $r->stops->map(fn (RouteStop $s) => [
                'id' => $s->id,
                'sort_order' => $s->sort_order,
                'status' => $s->status,
                'shipment' => $s->shipment,
            ]),
        ]);

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

        $route->load(['driver:id,name,initials,phone,vehicle,plate,zone,status', 'stops.shipment:id,display_code,tracking_code,status,recipient_name,recipient_address,recipient_phone,recipient_city,payment_type,cod_amount,driver_fee,recipient_lat,recipient_lng']);

        return response()->json([
            'id' => $route->id,
            'driver' => $route->driver,
            'route_date' => $route->route_date->toDateString(),
            'zone' => $route->zone,
            'status' => $route->status,
            'total_stops' => $route->total_stops,
            'completed_stops' => $route->completed_stops,
            'progress' => $route->progress(),
            'stops' => $route->stops->map(fn (RouteStop $s) => [
                'id' => $s->id,
                'sort_order' => $s->sort_order,
                'status' => $s->status,
                'shipment' => $s->shipment,
            ]),
        ]);
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
                    $routeQuery
                        ->whereDate('route_date', $date)
                        ->whereIn('status', ['planned', 'active']);
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
                'route' => $route->fresh()->load(['driver:id,name,initials,phone,vehicle,plate,zone,status', 'stops.shipment']),
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
            'route' => $route->fresh()->load(['driver:id,name,initials,phone,vehicle,plate,zone,status', 'stops.shipment']),
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
            'route' => $route->fresh()->load(['driver:id,name,initials,phone,vehicle,plate,zone,status', 'stops.shipment']),
        ]);
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

            return $route->fresh();
        });

        $optimization = $this->optimizePendingStops($route, $optimizer, $origin);
        $route = $route->fresh()->load(['driver:id,name,initials,phone,vehicle,plate,zone,status', 'stops.shipment']);

        return [
            'message' => 'Ruta creada',
            'route' => $route,
            'optimization' => $optimization,
        ];
    }

    private function currentOpenRouteStopConstraint($query, int $driverId, string $date): void
    {
        $query->whereHas('route', fn ($routeQuery) => $this->currentOpenRouteConstraint($routeQuery, $driverId, $date));
    }

    private function currentOpenRouteConstraint($query, int $driverId, string $date): void
    {
        $query->where('driver_id', $driverId)
            ->whereDate('route_date', $date)
            ->whereIn('status', ['planned', 'active']);
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
