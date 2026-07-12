<?php

namespace App\Http\Controllers\Api;

use App\Domain\Operations\Enums\AssigneeType;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Operations\Services\ReturnTaskService;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Models\PickupBatch;
use App\Domain\Pickup\Services\CollectorHandoverService;
use App\Domain\Pickup\Services\PickupReceptionService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class OperationalTaskController extends Controller
{
    public function createReturn(Request $request, Shipment $shipment, ReturnTaskService $service): JsonResponse
    {
        $data = $request->validate([
            'return_type' => ['required', Rule::in(['return_to_hub', 'return_to_client'])],
            'service_location_id' => ['nullable', 'integer', 'exists:service_locations,id'],
            'assigned_driver_id' => ['nullable', 'integer', 'exists:drivers,id'],
            'scheduled_date' => ['nullable', 'date'],
            'reason_code' => ['required', 'string', 'max:64'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        return response()->json(['data' => $service->create($shipment, $request->user(), $data)], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $tasks = OperationalTask::query()
            ->with(['customer:id,name,company,phone', 'shipment:id,display_code,recipient_name,recipient_address', 'pickupRequest.packages', 'serviceLocation:id,name,address_line1', 'assignedDriver:id,name,phone'])
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')))
            ->when($request->filled('task_type'), fn ($query) => $query->where('task_type', $request->string('task_type')))
            ->latest('id')
            ->paginate(min(max($request->integer('per_page', 20), 1), 100));

        return response()->json($tasks);
    }

    public function assign(Request $request, OperationalTask $operationalTask, OperationalTaskService $service): JsonResponse
    {
        $validated = $request->validate([
            'assignee_type' => ['required', Rule::enum(AssigneeType::class)],
            'assigned_driver_id' => ['nullable', 'integer', 'exists:drivers,id'],
            'assigned_executor_name' => ['nullable', 'string', 'max:120'],
            'assigned_executor_phone' => ['nullable', 'string', 'max:24'],
            'scheduled_date' => ['nullable', 'date'],
            'window_starts_at' => ['nullable', 'date'],
            'window_ends_at' => ['nullable', 'date', 'after_or_equal:window_starts_at'],
        ]);

        $type = AssigneeType::from($validated['assignee_type']);
        if ($type === AssigneeType::DANHEI_DRIVER && empty($validated['assigned_driver_id'])) {
            throw ValidationException::withMessages(['assigned_driver_id' => 'Seleccione el piloto responsable.']);
        }
        if ($type !== AssigneeType::DANHEI_DRIVER && blank($validated['assigned_executor_name'] ?? null)) {
            throw ValidationException::withMessages(['assigned_executor_name' => 'Identifique al responsable autorizado.']);
        }

        $operationalTask->load('pickupRequest.packages');
        if ($operationalTask->pickupRequest?->packages->contains(fn ($package) => $package->shipment_id === null)) {
            throw ValidationException::withMessages(['pickup_request_id' => 'Materialice las guías antes de asignar la recogida.']);
        }

        $operationalTask->update($validated);
        $operationalTask = $service->transition($operationalTask, OperationalTaskStatus::ASSIGNED);
        $operationalTask->pickupRequest?->update(['status' => PickupStatus::ASSIGNED]);

        return response()->json(['data' => $operationalTask->load(['pickupRequest.packages', 'assignedDriver'])]);
    }

    public function transition(Request $request, OperationalTask $operationalTask, OperationalTaskService $service): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in([
                OperationalTaskStatus::ACCEPTED->value,
                OperationalTaskStatus::IN_PROGRESS->value,
            ])],
        ]);

        $task = $service->transition($operationalTask, OperationalTaskStatus::from($validated['status']));

        return response()->json(['data' => $task->load('pickupRequest.packages')]);
    }

    public function startBatch(Request $request, OperationalTask $operationalTask, PickupReceptionService $service): JsonResponse
    {
        $validated = $request->validate([
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
        ]);

        $batch = $service->start($operationalTask, $request->user(), $validated);

        return response()->json(['data' => $batch], 201);
    }

    public function reconcile(Request $request, PickupBatch $pickupBatch, PickupReceptionService $service): JsonResponse
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.pickup_package_id' => ['required', 'integer'],
            'items.*.result' => ['required', Rule::in(['received', 'rejected', 'missing'])],
            'items.*.exception_code' => ['nullable', 'string', 'max:64'],
            'items.*.exception_notes' => ['nullable', 'string', 'max:1000'],
        ]);

        return response()->json(['data' => $service->reconcile($pickupBatch, $request->user(), $validated['items'])]);
    }

    public function handoverToHub(Request $request, OperationalTask $operationalTask, CollectorHandoverService $service): JsonResponse
    {
        $validated = $request->validate([
            'service_location_id' => ['required', 'integer', 'exists:service_locations,id'],
        ]);
        $location = ServiceLocation::query()->where('is_active', true)->findOrFail($validated['service_location_id']);
        $count = $service->handover($operationalTask, $location, $request->user());

        return response()->json([
            'data' => [
                'task_id' => $operationalTask->id,
                'service_location_id' => $location->id,
                'shipments_transferred' => $count,
            ],
        ]);
    }
}
