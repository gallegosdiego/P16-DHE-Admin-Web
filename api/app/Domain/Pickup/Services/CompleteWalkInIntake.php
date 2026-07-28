<?php

namespace App\Domain\Pickup\Services;

use App\Domain\Operations\Enums\AssigneeType;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Models\PickupBatch;
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
            $pickupRequest = $this->createWalkInRequest($scope, $idempotencyKey, $payload);
            $pickupRequest = $this->acceptRequest($pickupRequest);
            $packages = $pickupRequest->packages()->orderBy('package_index')->get();
            $receivedIds = $this->receivedPackageIds($packages, $payload);

            $this->materializeReceivedPackages($pickupRequest, $payload, $actor, $receivedIds);
            $task = $this->assignWalkInTask($pickupRequest, $actor);
            $batch = $this->startReceptionBatch($task, $actor, $payload);
            $this->reconcileReception($batch, $packages, $payload, $actor);

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

    /** @param array<string, mixed> $payload */
    private function createWalkInRequest(
        string $scope,
        string $idempotencyKey,
        array $payload,
    ): PickupRequest {
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

        return $this->creator->execute($scope, $idempotencyKey, $creationPayload);
    }

    private function acceptRequest(PickupRequest $pickupRequest): PickupRequest
    {
        $pickupRequest = PickupRequest::query()->lockForUpdate()->findOrFail($pickupRequest->id);
        $pickupRequest->forceFill([
            'status' => PickupStatus::ACCEPTED->value,
            'accepted_at' => now(),
        ])->save();

        return $pickupRequest;
    }

    /** @param iterable<object> $packages @param array<string, mixed> $payload */
    private function receivedPackageIds(iterable $packages, array $payload): array
    {
        $receivedIds = [];
        foreach ($packages as $package) {
            $input = $this->packageInput($payload, (int) $package->package_index);
            if (($input['reception_result'] ?? 'received') === 'received') {
                $receivedIds[] = (int) $package->id;
            }
        }

        return $receivedIds;
    }

    /** @param array<string, mixed> $payload */
    private function materializeReceivedPackages(
        PickupRequest $pickupRequest,
        array $payload,
        User $actor,
        array $receivedIds,
    ): void {
        if ($receivedIds === []) {
            return;
        }

        $this->materializer->execute($pickupRequest, [
            'default_shipping_cost' => (int) $payload['default_shipping_cost'],
            'default_driver_fee' => (int) $payload['default_driver_fee'],
            'non_cod_payment_type' => $payload['non_cod_payment_type'] ?? null,
        ], $actor, $receivedIds);
    }

    private function assignWalkInTask(PickupRequest $pickupRequest, User $actor): OperationalTask
    {
        /** @var OperationalTask $task */
        $task = $pickupRequest->tasks()->lockForUpdate()->firstOrFail();
        $task->forceFill([
            'assignee_type' => AssigneeType::HUB_OPERATOR->value,
            'assigned_user_id' => $actor->id,
            'assigned_driver_id' => null,
            'assigned_executor_name' => $actor->name,
            'assigned_executor_phone' => $actor->phone,
        ])->save();

        foreach ([
            OperationalTaskStatus::ASSIGNED,
            OperationalTaskStatus::ACCEPTED,
            OperationalTaskStatus::IN_PROGRESS,
        ] as $status) {
            $task = $this->tasks->transition($task, $status);
        }

        $pickupRequest->forceFill(['status' => PickupStatus::ASSIGNED->value])->save();

        return $task;
    }

    /** @param array<string, mixed> $payload */
    private function startReceptionBatch(OperationalTask $task, User $actor, array $payload): PickupBatch
    {
        $batch = $this->reception->start($task, $actor);
        $batch->forceFill([
            'delivered_by_name' => $payload['delivered_by_name'] ?? $payload['contact_name'],
            'delivered_by_phone' => $payload['delivered_by_phone'] ?? $payload['contact_phone'],
            'delivered_by_relationship' => $payload['delivered_by_relationship'] ?? 'client_contact',
            'notes' => $payload['delivered_by_notes'] ?? $payload['reception_notes'] ?? null,
        ])->save();

        return $batch;
    }

    /** @param iterable<object> $packages @param array<string, mixed> $payload */
    private function reconcileReception(PickupBatch $batch, iterable $packages, array $payload, User $actor): void
    {
        $results = [];
        foreach ($packages as $package) {
            $input = $this->packageInput($payload, (int) $package->package_index);
            $result = $input['reception_result'] ?? 'received';
            $results[] = [
                'pickup_package_id' => $package->id,
                'result' => $result,
                'exception_code' => $input['exception_code'] ?? ($result === 'rejected' ? 'REJECTED_AT_HUB' : null),
                'exception_notes' => $input['exception_notes'] ?? null,
            ];
        }

        $this->reception->reconcile($batch, $actor, $results);
    }

    /** @param array<string, mixed> $payload */
    private function packageInput(array $payload, int $packageIndex): array
    {
        return $payload['packages'][$packageIndex - 1] ?? [];
    }
}
