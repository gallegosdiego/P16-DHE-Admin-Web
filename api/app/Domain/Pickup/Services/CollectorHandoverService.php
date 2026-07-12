<?php

namespace App\Domain\Pickup\Services;

use App\Domain\Operations\Enums\AssigneeType;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Services\CustodyRecorder;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CollectorHandoverService
{
    public function __construct(private readonly CustodyRecorder $custody) {}

    public function handover(OperationalTask $task, ServiceLocation $location, User $user): int
    {
        return DB::transaction(function () use ($task, $location, $user) {
            $task = OperationalTask::query()
                ->lockForUpdate()
                ->with(['pickupBatches.items.pickupPackage.shipment'])
                ->findOrFail($task->id);

            if ($task->assignee_type !== AssigneeType::AUTHORIZED_COLLECTOR
                || ! in_array($task->status, [OperationalTaskStatus::COMPLETED, OperationalTaskStatus::PARTIALLY_COMPLETED], true)) {
                throw ValidationException::withMessages([
                    'task' => 'Solo una recogida completada por recolector autorizado puede entregarse en sede.',
                ]);
            }

            $batch = $task->pickupBatches()->latest('id')->first();
            if ($batch === null) {
                throw ValidationException::withMessages(['task' => 'La tarea no tiene un lote físico conciliado.']);
            }

            $recorded = 0;
            foreach ($batch->items()->with('pickupPackage.shipment')->where('result', 'received')->get() as $item) {
                $shipment = $item->pickupPackage?->shipment;
                if ($shipment === null) {
                    continue;
                }

                $last = CustodyEvent::query()->where('shipment_id', $shipment->id)->latest('occurred_at')->latest('id')->first();
                if ($last?->new_custodian_type === 'hub' && (int) $last->new_custodian_id === (int) $location->id) {
                    continue;
                }

                $this->custody->record($shipment, [
                    'event_type' => 'collector_handover_to_hub',
                    'previous_custodian_type' => 'authorized_collector',
                    'previous_custodian_name' => $task->assigned_executor_name,
                    'new_custodian_type' => 'hub',
                    'new_custodian_id' => $location->id,
                    'new_custodian_name' => $location->name,
                    'actor_user_id' => $user->id,
                ]);
                $recorded++;
            }

            AuditLog::log(
                'operations.collector_handover_completed',
                $task,
                null,
                ['service_location_id' => $location->id, 'shipments_transferred' => $recorded],
                'Recolector autorizado entregó paquetes recibidos en sede.',
            );

            return $recorded;
        });
    }
}
