<?php

namespace App\Domain\Pickup\Services;

use App\Domain\Operations\Enums\AssigneeType;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Actions\TransitionShipmentStatus;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Services\CustodyRecorder;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CollectorHandoverService
{
    public function __construct(
        private readonly CustodyRecorder $custody,
        private readonly TransitionShipmentStatus $transitionShipmentStatus,
    ) {}

    public function handover(OperationalTask $task, ServiceLocation $location, User $user): int
    {
        return DB::transaction(function () use ($task, $location, $user) {
            $task = OperationalTask::query()
                ->lockForUpdate()
                ->with(['pickupBatches.items.pickupPackage.shipment'])
                ->findOrFail($task->id);

            if (! in_array($task->assignee_type, [
                AssigneeType::DANHEI_DRIVER,
                AssigneeType::DANHEI_EMPLOYEE,
                AssigneeType::AUTHORIZED_COLLECTOR,
            ], true)
                || ! in_array($task->status, [OperationalTaskStatus::COMPLETED, OperationalTaskStatus::PARTIALLY_COMPLETED], true)) {
                throw ValidationException::withMessages([
                    'task' => 'Solo una recogida de campo completada puede entregarse en sede.',
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

                $previousType = match ($task->assignee_type) {
                    AssigneeType::DANHEI_DRIVER => 'driver',
                    AssigneeType::DANHEI_EMPLOYEE => 'danhei_employee',
                    default => 'authorized_collector',
                };
                $previousId = match ($task->assignee_type) {
                    AssigneeType::DANHEI_DRIVER => $task->assigned_driver_id,
                    AssigneeType::DANHEI_EMPLOYEE => $task->assigned_user_id,
                    default => null,
                };

                $this->custody->record($shipment, [
                    'event_type' => 'collector_handover_to_hub',
                    'previous_custodian_type' => $previousType,
                    'previous_custodian_id' => $previousId,
                    'previous_custodian_name' => $task->assigned_executor_name,
                    'new_custodian_type' => 'hub',
                    'new_custodian_id' => $location->id,
                    'new_custodian_name' => $location->name,
                    'actor_user_id' => $user->id,
                ]);
                if ($shipment->status === ShipmentStatus::PICKED_UP) {
                    $this->transitionShipmentStatus->execute(
                        $shipment,
                        ShipmentStatus::IN_WAREHOUSE,
                        $user,
                        "Paquete recibido en {$location->name} después de recogida de campo.",
                    );
                }
                $recorded++;
            }

            AuditLog::log(
                'operations.collector_handover_completed',
                $task,
                null,
                ['service_location_id' => $location->id, 'shipments_transferred' => $recorded],
                'Responsable de recogida entregó paquetes recibidos en sede.',
            );

            return $recorded;
        });
    }
}
