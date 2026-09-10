<?php

namespace App\Http\Controllers\Api;

use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Pickup\Models\PickupBatch;
use App\Domain\Pickup\Services\PickupReceptionService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DriverPickupTaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $driverId = $request->user()->driver_id;
        abort_if($driverId === null, 403, 'El usuario no está vinculado a un piloto.');

        $tasks = OperationalTask::query()
            ->where('assigned_driver_id', $driverId)
            ->where('task_type', 'client_pickup')
            ->whereIn('status', ['assigned', 'accepted', 'in_progress'])
            ->with(['customer:id,name,company,phone', 'pickupRequest.packages', 'pickupBatches.items'])
            ->orderBy('scheduled_date')
            ->orderBy('window_starts_at')
            ->get();

        return response()->json(['data' => $tasks]);
    }

    public function transition(Request $request, OperationalTask $operationalTask, OperationalTaskService $service): JsonResponse
    {
        $this->authorizeDriver($request, $operationalTask);
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
        $this->authorizeDriver($request, $operationalTask);
        $validated = $request->validate([
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
        ]);

        $batch = $service->start($operationalTask, $request->user(), $validated);

        return response()->json(['data' => $batch], 201);
    }

    public function reconcile(Request $request, PickupBatch $pickupBatch, PickupReceptionService $service): JsonResponse
    {
        $pickupBatch->load('operationalTask');
        $this->authorizeDriver($request, $pickupBatch->operationalTask);
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.pickup_package_id' => ['required', 'integer'],
            'items.*.result' => ['required', Rule::in(['received', 'rejected', 'missing'])],
            'items.*.physical_condition' => ['nullable', Rule::in(['intact', 'observed_damage', 'unknown'])],
            'items.*.exception_code' => ['nullable', 'string', 'max:64'],
            'items.*.exception_notes' => ['nullable', 'string', 'max:1000'],
            'items.*.evidence_photo' => ['nullable', 'file', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],

            'undeclared_packages' => ['nullable', 'array'],
            'undeclared_packages.*.recipient_name' => ['required', 'string', 'max:120'],
            'undeclared_packages.*.recipient_phone' => ['required', 'string', 'max:24'],
            'undeclared_packages.*.delivery_address_line1' => ['required', 'string', 'max:200'],
            'undeclared_packages.*.delivery_address_complement' => ['nullable', 'string', 'max:120'],
            'undeclared_packages.*.delivery_zone' => ['nullable', 'string', 'max:60'],
            'undeclared_packages.*.delivery_city' => ['nullable', 'string', 'max:60'],
            'undeclared_packages.*.delivery_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'undeclared_packages.*.delivery_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'undeclared_packages.*.is_cod' => ['sometimes', 'boolean'],
            'undeclared_packages.*.requested_cod_amount' => ['nullable', 'integer', 'min:0', 'max:50000000'],
            'undeclared_packages.*.payment_type' => ['sometimes', 'nullable', Rule::in(['cash_on_delivery', 'post_sale', 'prepaid', 'mercado_libre'])],
            'undeclared_packages.*.is_fragile' => ['sometimes', 'boolean'],
            'undeclared_packages.*.package_type' => ['nullable', 'string', 'max:60'],
            'undeclared_packages.*.size_code' => ['nullable', 'string', 'max:40'],
            'undeclared_packages.*.approx_weight_kg' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'undeclared_packages.*.special_handling_notes' => ['nullable', 'string', 'max:2000'],
            'undeclared_packages.*.physical_condition' => ['nullable', Rule::in(['intact', 'observed_damage', 'unknown'])],
            'undeclared_packages.*.exception_code' => ['nullable', 'string', 'max:64'],
            'undeclared_packages.*.exception_notes' => ['nullable', 'string', 'max:1000'],
            'undeclared_packages.*.evidence_photo' => ['nullable', 'file', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ]);

        $items = array_map(
            static fn (array $item): array => [...$item, 'evidence_source' => 'mobile'],
            $validated['items'],
        );

        $undeclaredPackages = array_map(
            static fn (array $item): array => [...$item, 'evidence_source' => 'mobile'],
            $validated['undeclared_packages'] ?? [],
        );

        $batch = $service->reconcile($pickupBatch, $request->user(), $items, $undeclaredPackages);

        return response()->json(['data' => $batch]);
    }

    private function authorizeDriver(Request $request, OperationalTask $task): void
    {
        abort_unless(
            $request->user()->driver_id !== null
                && (int) $task->assigned_driver_id === (int) $request->user()->driver_id,
            403,
            'La tarea no está asignada a este piloto.',
        );
    }
}
