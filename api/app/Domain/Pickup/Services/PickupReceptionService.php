<?php

namespace App\Domain\Pickup\Services;

use App\Domain\Operations\Enums\AssigneeType;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Pickup\Enums\PickupBatchStatus;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Models\PickupBatch;
use App\Domain\Pickup\Models\PickupBatchItem;
use App\Domain\Shipment\Services\CustodyRecorder;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PickupReceptionService
{
    public function __construct(
        private readonly PickupBatchService $batches,
        private readonly OperationalTaskService $tasks,
        private readonly CustodyRecorder $custody,
    ) {}

    /** @param array{lat?: float|null, lng?: float|null} $arrival */
    public function start(OperationalTask $task, User $user, array $arrival = []): PickupBatch
    {
        return DB::transaction(function () use ($task, $user, $arrival) {
            $task = OperationalTask::query()
                ->lockForUpdate()
                ->with(['pickupRequest.packages', 'assignedDriver', 'serviceLocation'])
                ->findOrFail($task->id);
            if ($task->status !== OperationalTaskStatus::IN_PROGRESS || $task->pickupRequest === null) {
                throw ValidationException::withMessages(['status' => 'La tarea debe estar en ejecución antes de recibir paquetes.']);
            }

            $existing = PickupBatch::query()
                ->where('operational_task_id', $task->id)
                ->whereIn('status', [PickupBatchStatus::OPEN->value, PickupBatchStatus::RECEIVING->value])
                ->first();
            if ($existing !== null) {
                return $existing->load('items.pickupPackage');
            }

            $batch = PickupBatch::query()->create([
                'batch_code' => 'PB-'.now()->format('ymd').'-'.Str::upper(Str::random(6)),
                'pickup_request_id' => $task->pickup_request_id,
                'operational_task_id' => $task->id,
                'service_location_id' => $task->service_location_id,
                'driver_id' => $task->assigned_driver_id,
                'intake_mode' => $task->pickupRequest->intake_mode,
                'status' => PickupBatchStatus::RECEIVING,
                'executor_type' => $task->assignee_type ?? AssigneeType::DANHEI_DRIVER,
                'executor_name' => $task->assigned_executor_name ?? $task->assignedDriver?->name ?? $task->serviceLocation?->name,
                'received_by' => $user->id,
                'expected_packages' => $task->pickupRequest->packages->count(),
                'arrival_lat' => $arrival['lat'] ?? null,
                'arrival_lng' => $arrival['lng'] ?? null,
                'arrived_at' => now(),
            ]);

            foreach ($task->pickupRequest->packages as $package) {
                PickupBatchItem::query()->create([
                    'pickup_batch_id' => $batch->id,
                    'pickup_package_id' => $package->id,
                    'shipment_id' => $package->shipment_id,
                    'item_reference' => $package->guide_number ?? $package->qr_reference,
                    'result' => 'pending',
                ]);
            }

            return $batch->load('items.pickupPackage');
        });
    }

    /** @param list<array{pickup_package_id: int, result: string, exception_code?: string|null, exception_notes?: string|null}> $results */
    public function reconcile(PickupBatch $batch, User $user, array $results): PickupBatch
    {
        return DB::transaction(function () use ($batch, $user, $results) {
            $batch = PickupBatch::query()->lockForUpdate()->with(['items.pickupPackage.shipment', 'operationalTask', 'pickupRequest'])->findOrFail($batch->id);
            if ($batch->status !== PickupBatchStatus::RECEIVING) {
                throw ValidationException::withMessages(['status' => 'El lote no está abierto para conciliación.']);
            }

            $indexed = collect($results)->keyBy('pickup_package_id');
            if ($indexed->count() !== $batch->items->count() || $batch->items->contains(fn ($item) => ! $indexed->has($item->pickup_package_id))) {
                throw ValidationException::withMessages(['items' => 'Debe informar una sola vez el resultado de cada paquete esperado.']);
            }

            $counts = ['received' => 0, 'rejected' => 0, 'missing' => 0];
            foreach ($batch->items as $item) {
                $result = $indexed->get($item->pickup_package_id);
                if (! in_array($result['result'], array_keys($counts), true)) {
                    throw ValidationException::withMessages(['items' => 'Resultado de paquete no permitido.']);
                }

                $counts[$result['result']]++;
                $item->update([
                    'result' => $result['result'],
                    'exception_code' => $result['exception_code'] ?? null,
                    'exception_notes' => $result['exception_notes'] ?? null,
                    'verified_at' => now(),
                    'verified_by' => $user->id,
                ]);

                if ($result['result'] === 'received' && $item->pickupPackage?->shipment !== null) {
                    $this->custody->record($item->pickupPackage->shipment, [
                        'event_type' => 'picked_up_from_client',
                        'previous_custodian_type' => 'client',
                        'previous_custodian_id' => $batch->pickupRequest->customer_id,
                        'previous_custodian_name' => $batch->pickupRequest->contact_name,
                        'new_custodian_type' => $batch->driver_id
                            ? 'driver'
                            : ($batch->executor_type === AssigneeType::AUTHORIZED_COLLECTOR ? 'authorized_collector' : 'hub'),
                        'new_custodian_id' => $batch->driver_id ?? $batch->service_location_id,
                        'new_custodian_name' => $batch->executor_name,
                        'actor_user_id' => $user->id,
                    ]);
                }
            }

            $batch->forceFill([
                'received_packages' => $counts['received'],
                'rejected_packages' => $counts['rejected'],
                'missing_packages' => $counts['missing'],
            ])->save();

            $hasDifferences = $counts['rejected'] > 0 || $counts['missing'] > 0;
            $batch = $this->batches->transition(
                $batch,
                $hasDifferences ? PickupBatchStatus::COMPLETED_WITH_DIFFERENCES : PickupBatchStatus::COMPLETED,
            );

            $taskTarget = $counts['received'] === 0
                ? OperationalTaskStatus::FAILED
                : ($hasDifferences ? OperationalTaskStatus::PARTIALLY_COMPLETED : OperationalTaskStatus::COMPLETED);
            $this->tasks->transition($batch->operationalTask, $taskTarget);

            $pickupStatus = $counts['received'] === 0
                ? PickupStatus::NOT_PICKED_UP
                : ($hasDifferences ? PickupStatus::PARTIALLY_PICKED_UP : PickupStatus::PICKED_UP);
            $batch->pickupRequest->update(['status' => $pickupStatus]);

            return $batch->refresh()->load('items.pickupPackage');
        });
    }
}
