<?php

namespace App\Domain\Pickup\Services;

use App\Domain\Operations\Enums\AssigneeType;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shared\Services\IdempotencyService;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class CompleteWalkInIntake
{
    public function __construct(
        private readonly IdempotencyService $idempotency,
        private readonly CreatePickupRequest $creator,
        private readonly MaterializePickupShipments $materializer,
        private readonly OperationalTaskService $tasks,
        private readonly PickupReceptionService $reception,
    ) {}

    /** @param array<string, mixed> $payload */
    public function execute(
        string $scope,
        string $idempotencyKey,
        array $payload,
        User $actor,
    ): PickupRequest {
        /** @var PickupRequest $pickupRequest */
        $pickupRequest = $this->idempotency->runForModel(
            $scope,
            $idempotencyKey,
            'complete_walk_in_intake',
            $payload,
            fn () => $this->complete($scope, $idempotencyKey, $payload, $actor),
        );

        return $pickupRequest->load([
            'customer',
            'serviceLocation',
            'packages.shipment',
            'tasks.assignedUser',
            'batches.items.pickupPackage.shipment',
        ]);
    }

    /** @param array<string, mixed> $payload */
    private function complete(
        string $scope,
        string $idempotencyKey,
        array $payload,
        User $actor,
    ): PickupRequest {
        return DB::transaction(function () use ($scope, $idempotencyKey, $payload, $actor) {
            $creationPayload = Arr::except($payload, [
                'default_shipping_cost',
                'default_driver_fee',
                'non_cod_payment_type',
                'delivered_by_name',
                'delivered_by_phone',
                'delivered_by_relationship',
                'delivered_by_notes',
                'reception_notes',
            ]);
            $creationPayload['source'] = 'hub_walk_in';
            $creationPayload['intake_mode'] = 'walk_in_at_hub';
            $creationPayload['packages'] = array_map(
                fn (array $package) => Arr::except($package, ['reception_result', 'exception_code', 'exception_notes']),
                $payload['packages'],
            );

            $pickupRequest = $this->creator->execute(
                $scope,
                $idempotencyKey,
                $creationPayload,
            );

            $pickupRequest = PickupRequest::query()->lockForUpdate()->findOrFail($pickupRequest->id);
            $pickupRequest->forceFill([
                'status' => PickupStatus::ACCEPTED->value,
                'accepted_at' => now(),
            ])->save();

            $packages = $pickupRequest->packages()->orderBy('package_index')->get();
            $receivedIds = $packages
                ->filter(fn ($package) => ($payload['packages'][$package->package_index - 1]['reception_result'] ?? 'received') === 'received')
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();

            if ($receivedIds !== []) {
                $this->materializer->execute($pickupRequest, [
                    'default_shipping_cost' => (int) $payload['default_shipping_cost'],
                    'default_driver_fee' => (int) $payload['default_driver_fee'],
                    'non_cod_payment_type' => $payload['non_cod_payment_type'] ?? null,
                ], $actor, $receivedIds);
            }

            /** @var OperationalTask $task */
            $task = $pickupRequest->tasks()->lockForUpdate()->firstOrFail();
            $task->forceFill([
                'assignee_type' => AssigneeType::HUB_OPERATOR->value,
                'assigned_user_id' => $actor->id,
                'assigned_driver_id' => null,
                'assigned_executor_name' => $actor->name,
                'assigned_executor_phone' => $actor->phone,
            ])->save();
            $task = $this->tasks->transition($task, OperationalTaskStatus::ASSIGNED);
            $task = $this->tasks->transition($task, OperationalTaskStatus::ACCEPTED);
            $task = $this->tasks->transition($task, OperationalTaskStatus::IN_PROGRESS);
            $pickupRequest->forceFill(['status' => PickupStatus::ASSIGNED->value])->save();

            $batch = $this->reception->start($task, $actor);
            $batch->forceFill([
                'delivered_by_name' => $payload['delivered_by_name'] ?? $payload['contact_name'],
                'delivered_by_phone' => $payload['delivered_by_phone'] ?? $payload['contact_phone'],
                'delivered_by_relationship' => $payload['delivered_by_relationship'] ?? 'client_contact',
                'notes' => $payload['delivered_by_notes'] ?? $payload['reception_notes'] ?? null,
            ])->save();

            $results = $packages->map(function ($package) use ($payload): array {
                $input = $payload['packages'][$package->package_index - 1];
                $result = $input['reception_result'] ?? 'received';

                return [
                    'pickup_package_id' => $package->id,
                    'result' => $result,
                    'exception_code' => $input['exception_code'] ?? ($result === 'rejected' ? 'REJECTED_AT_HUB' : null),
                    'exception_notes' => $input['exception_notes'] ?? null,
                ];
            })->all();
            $this->reception->reconcile($batch, $actor, $results);

            AuditLog::log(
                'operations.walk_in_intake_completed',
                $pickupRequest,
                null,
                [
                    'service_location_id' => $pickupRequest->service_location_id,
                    'received_packages' => count($receivedIds),
                    'total_packages' => $packages->count(),
                ],
                "Ingreso espontáneo {$pickupRequest->pickup_code} recibido y conciliado en mostrador.",
            );

            return $pickupRequest->refresh();
        });
    }
}
