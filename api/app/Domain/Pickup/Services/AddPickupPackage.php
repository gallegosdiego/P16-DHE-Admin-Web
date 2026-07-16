<?php

namespace App\Domain\Pickup\Services;

use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shared\Services\IdempotencyService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AddPickupPackage
{
    public function __construct(private readonly IdempotencyService $idempotency) {}

    /** @param array<string, mixed> $payload */
    public function execute(
        PickupRequest $pickupRequest,
        string $scope,
        string $idempotencyKey,
        array $payload,
    ): PickupPackage {
        /** @var PickupPackage $package */
        $package = $this->idempotency->runForModel(
            $scope,
            $idempotencyKey,
            'add_pickup_package:'.$pickupRequest->getKey(),
            $payload,
            fn () => $this->create($pickupRequest, $payload),
        );

        return $package->load('shipment');
    }

    /** @param array<string, mixed> $payload */
    private function create(PickupRequest $pickupRequest, array $payload): PickupPackage
    {
        return DB::transaction(function () use ($pickupRequest, $payload) {
            $request = PickupRequest::query()
                ->lockForUpdate()
                ->with(['tasks:id,pickup_request_id,status', 'batches:id,pickup_request_id'])
                ->findOrFail($pickupRequest->getKey());

            if (in_array($request->status, [
                PickupStatus::CANCELLED,
                PickupStatus::ASSIGNED,
                PickupStatus::DRIVER_ON_THE_WAY,
                PickupStatus::PARTIALLY_PICKED_UP,
                PickupStatus::PICKED_UP,
                PickupStatus::NOT_PICKED_UP,
            ], true)) {
                throw ValidationException::withMessages([
                    'pickup_request' => 'No se pueden agregar paquetes desde el estado actual de la solicitud.',
                ]);
            }

            if ($request->batches->isNotEmpty()
                || $request->tasks->contains(fn ($task) => $task->status !== OperationalTaskStatus::PENDING)) {
                throw ValidationException::withMessages([
                    'pickup_request' => 'Solo se pueden agregar paquetes antes de asignar o iniciar la tarea.',
                ]);
            }

            $currentCount = PickupPackage::query()
                ->where('pickup_request_id', $request->id)
                ->lockForUpdate()
                ->count();
            if ($currentCount >= 100) {
                throw ValidationException::withMessages([
                    'pickup_request' => 'La solicitud ya alcanzó el máximo de 100 paquetes.',
                ]);
            }

            $package = PickupPackage::query()->create(array_merge($payload, [
                'pickup_request_id' => $request->id,
                'package_index' => $currentCount + 1,
                'is_cod' => (bool) ($payload['is_cod'] ?? false),
                'requested_cod_amount' => (int) ($payload['requested_cod_amount'] ?? 0),
                'is_fragile' => (bool) ($payload['is_fragile'] ?? false),
            ]));

            $request->forceFill([
                'package_count' => PickupPackage::query()->where('pickup_request_id', $request->id)->count(),
                'requested_cod_total' => (int) PickupPackage::query()
                    ->where('pickup_request_id', $request->id)
                    ->sum('requested_cod_amount'),
            ])->save();

            AuditLog::log(
                'operations.pickup_package_added',
                $package,
                null,
                $package->only(['pickup_request_id', 'package_index', 'is_cod', 'requested_cod_amount']),
                "Paquete {$package->package_index} agregado a la solicitud {$request->pickup_code}.",
            );

            return $package;
        });
    }
}
