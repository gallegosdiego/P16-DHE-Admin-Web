<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RouteController extends Controller
{
    public function myRoute(Request $request): JsonResponse
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);

        if ($driverId <= 0) {
            return response()->json(['error' => 'Acceso denegado'], 403);
        }

        $route = Route::where('driver_id', $driverId)
            ->whereDate('route_date', now()->toDateString())
            ->with(['stops' => function ($query) {
                $query->orderBy('sort_order')
                    ->with('shipment:id,display_code,status,recipient_name,recipient_phone,recipient_address,recipient_zone,payment_type,cod_amount,shipping_cost,notes');
            }])
            ->first();

        if (! $route) {
            return response()->json([
                'route' => null,
                'message' => 'No tienes ruta asignada para hoy.',
            ]);
        }

        return response()->json([
            'route' => $route,
        ]);
    }

    /**
     * Listar rutas del dia (o fecha especifica).
     *
     * GET /api/routes?date=2026-05-13&driver_id=1
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'date' => ['nullable', 'date'],
            'driver_id' => ['nullable', 'integer', 'exists:drivers,id'],
        ]);

        $date = $filters['date'] ?? now()->toDateString();

        $query = Route::with(['driver:id,name,initials,phone,vehicle,plate,zone,status', 'stops.shipment:id,tracking_code,display_code,recipient_name,recipient_address,recipient_zone,status'])
            ->forDate($date);

        if (! empty($filters['driver_id'])) {
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
        ]);

        $date = $data['date'] ?? now()->toDateString();

        // Verificar que no exista ruta para ese conductor y fecha
        $existing = Route::where('driver_id', $data['driver_id'])
            ->whereDate('route_date', $date)
            ->first();

        if ($existing) {
            return response()->json([
                'message' => 'Ya existe una ruta para este conductor en esa fecha',
                'route_id' => $existing->id,
            ], 422);
        }

        $route = DB::transaction(function () use ($data, $date) {
            $route = Route::create([
                'driver_id' => $data['driver_id'],
                'route_date' => $date,
                'zone' => $data['zone'] ?? null,
                'status' => 'planned',
                'total_stops' => count($data['shipment_ids']),
                'completed_stops' => 0,
            ]);

            // Crear paradas ordenadas
            foreach ($data['shipment_ids'] as $index => $shipmentId) {
                RouteStop::create([
                    'route_id' => $route->id,
                    'shipment_id' => $shipmentId,
                    'sort_order' => $index + 1,
                    'status' => 'pending',
                ]);
            }

            // Asignar conductor a los envios que no lo tengan
            Shipment::whereIn('id', $data['shipment_ids'])
                ->whereNull('driver_id')
                ->update(['driver_id' => $data['driver_id']]);

            return $route;
        });

        $route->load(['driver:id,name,initials', 'stops.shipment:id,tracking_code,display_code,recipient_name,recipient_address']);

        return response()->json($route, 201);
    }

    /**
     * Ver ruta con detalle completo.
     *
     * GET /api/routes/{route}
     */
    public function show(Route $route): JsonResponse
    {
        $route->load(['driver', 'stops.shipment']);

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
    public function start(Route $route): JsonResponse
    {
        if ($route->status !== 'planned') {
            return response()->json(['message' => 'Solo se pueden activar rutas planificadas'], 422);
        }

        $route->update(['status' => 'active']);

        // Cambiar estado del conductor a "route"
        $route->driver?->update(['status' => 'route']);

        return response()->json(['message' => 'Ruta activada', 'status' => 'active']);
    }

    /**
     * Completar una parada.
     *
     * POST /api/routes/{route}/stops/{stop}/complete
     */
    public function completeStop(Route $route, RouteStop $stop): JsonResponse
    {
        if ($stop->route_id !== $route->id) {
            return response()->json(['message' => 'La parada no pertenece a esta ruta'], 422);
        }

        if ($stop->status === 'completed') {
            return response()->json(['message' => 'La parada ya esta completada'], 422);
        }

        $route->completeStop($stop);

        // Actualizar estado del envío asociado
        $stop->shipment->update(['status' => 'delivered', 'delivered_at' => now()]);

        return response()->json([
            'message' => 'Parada completada',
            'progress' => $route->fresh()->progress(),
            'route_status' => $route->fresh()->status,
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

        foreach ($data['stop_ids'] as $index => $stopId) {
            RouteStop::where('id', $stopId)
                ->where('route_id', $route->id)
                ->update(['sort_order' => $index + 1]);
        }

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

        $maxOrder = $route->stops()->max('sort_order') ?? 0;

        RouteStop::create([
            'route_id' => $route->id,
            'shipment_id' => $data['shipment_id'],
            'sort_order' => $maxOrder + 1,
        ]);

        $route->increment('total_stops');

        // Asignar conductor al envio
        Shipment::where('id', $data['shipment_id'])
            ->whereNull('driver_id')
            ->update(['driver_id' => $route->driver_id]);

        return response()->json(['message' => 'Parada agregada', 'total_stops' => $route->fresh()->total_stops]);
    }
}
