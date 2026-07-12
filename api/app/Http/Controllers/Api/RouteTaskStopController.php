<?php

namespace App\Http\Controllers\Api;

use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Enums\OperationalTaskType;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteTaskStop;
use App\Domain\Shipment\Services\CustodyRecorder;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class RouteTaskStopController extends Controller
{
    public function index(Route $route): JsonResponse
    {
        return response()->json(['data' => $this->stopsForRoute($route)]);
    }

    public function store(Request $request, Route $route): JsonResponse
    {
        $data = $request->validate([
            'operational_task_id' => ['required', 'integer', 'exists:operational_tasks,id'],
            'sort_order' => ['nullable', 'integer', 'min:1'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $stop = DB::transaction(function () use ($route, $data) {
            $task = OperationalTask::query()->lockForUpdate()->findOrFail($data['operational_task_id']);
            $status = $task->status instanceof OperationalTaskStatus ? $task->status : OperationalTaskStatus::from((string) $task->status);
            if ($status->isTerminal()) throw ValidationException::withMessages(['operational_task_id' => 'No se puede programar una tarea terminada.']);
            if ((int) $task->assigned_driver_id !== (int) $route->driver_id) throw ValidationException::withMessages(['operational_task_id' => 'La tarea debe estar asignada al mismo piloto de la ruta.']);
            if (RouteTaskStop::query()->where('operational_task_id', $task->id)->exists()) throw ValidationException::withMessages(['operational_task_id' => 'La tarea ya pertenece a una ruta.']);

            $nextSort = (int) (RouteTaskStop::query()->where('route_id', $route->id)->max('sort_order') ?? 0) + 1;
            return RouteTaskStop::create(['route_id' => $route->id, 'operational_task_id' => $task->id, 'sort_order' => $data['sort_order'] ?? $nextSort, 'notes' => $data['notes'] ?? null]);
        });

        return response()->json(['data' => $stop->load($this->relations())], 201);
    }

    public function transition(Request $request, Route $route, RouteTaskStop $routeTaskStop, OperationalTaskService $tasks): JsonResponse
    {
        abort_unless((int) $routeTaskStop->route_id === (int) $route->id, 422, 'La parada no pertenece a esta ruta.');
        $data = $request->validate(['status' => ['required', Rule::in(['accepted', 'in_progress', 'completed', 'failed'])], 'notes' => ['nullable', 'string', 'max:1000']]);
        $stop = DB::transaction(function () use ($routeTaskStop, $data, $tasks) {
            $stop = RouteTaskStop::query()->lockForUpdate()->findOrFail($routeTaskStop->id);
            $task = $stop->operationalTask()->lockForUpdate()->firstOrFail();
            $target = OperationalTaskStatus::from($data['status']);
            $tasks->transition($task, $target);
            if ($target === OperationalTaskStatus::COMPLETED && $task->shipment && in_array($task->task_type, [OperationalTaskType::RETURN_TO_HUB, OperationalTaskType::RETURN_TO_CLIENT], true)) {
                $shipment = $task->shipment;
                $toHub = $task->task_type === OperationalTaskType::RETURN_TO_HUB;
                $shipment->update(['status' => 'returned']);
                app(CustodyRecorder::class)->record($shipment, [
                    'operational_task_id' => $task->id,
                    'event_type' => $toHub ? 'return_received_at_hub' : 'return_completed_to_client',
                    'new_custodian_type' => $toHub ? 'service_location' : 'client',
                    'new_custodian_id' => $toHub ? $task->service_location_id : $task->customer_id,
                    'new_custodian_name' => $toHub ? $task->serviceLocation?->name : $task->customer?->name,
                    'actor_user_id' => request()->user()?->id,
                    'metadata_json' => ['route_task_stop_id' => $stop->id],
                ]);
            }
            $stop->update([
                'status' => $data['status'] === 'completed' ? 'completed' : ($data['status'] === 'failed' ? 'failed' : 'in_progress'),
                'started_at' => $data['status'] === 'in_progress' ? ($stop->started_at ?? now()) : $stop->started_at,
                'completed_at' => in_array($data['status'], ['completed', 'failed'], true) ? now() : null,
                'notes' => $data['notes'] ?? $stop->notes,
            ]);
            return $stop->fresh();
        });

        return response()->json(['data' => $stop->load($this->relations())]);
    }

    public function driverIndex(Request $request): JsonResponse
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);
        abort_unless($driverId > 0, 403, 'Acceso denegado.');
        $stops = RouteTaskStop::query()
            ->whereHas('route', fn ($query) => $query->where('driver_id', $driverId)->where('route_date', now()->toDateString())->whereIn('status', ['planned', 'active']))
            ->whereIn('status', ['pending', 'in_progress'])
            ->with($this->relations())
            ->orderBy('sort_order')
            ->get();
        return response()->json(['data' => $stops]);
    }

    public function driverTransition(Request $request, RouteTaskStop $routeTaskStop, OperationalTaskService $tasks): JsonResponse
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);
        $route = $routeTaskStop->route;
        abort_unless($route && $driverId > 0 && (int) $route->driver_id === $driverId, 403, 'La parada no pertenece a este piloto.');
        return $this->transition($request, $route, $routeTaskStop, $tasks);
    }

    private function relations(): array
    {
        return ['operationalTask.customer:id,name,company,phone', 'operationalTask.pickupRequest:id,pickup_code,pickup_address_line1,pickup_city', 'operationalTask.shipment:id,display_code,recipient_name,recipient_address'];
    }

    private function stopsForRoute(Route $route)
    {
        return $route->taskStops()->with($this->relations())->get();
    }
}
