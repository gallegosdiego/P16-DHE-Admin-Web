<?php

namespace App\Domain\Pickup\Services;

use App\Domain\Operations\Enums\IntakeMode;
use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shared\Services\IdempotencyService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CreatePickupRequest
{
    public function __construct(
        private readonly IdempotencyService $idempotency,
        private readonly OperationalTaskService $tasks,
    ) {}

    /** @param array<string, mixed> $payload */
    public function execute(string $scope, string $idempotencyKey, array $payload): PickupRequest
    {
        /** @var PickupRequest $request */
        $request = $this->idempotency->runForModel(
            $scope,
            $idempotencyKey,
            'create_pickup_request',
            $payload,
            fn () => $this->create($payload),
        );

        return $request->load(['customer', 'serviceLocation', 'packages', 'tasks']);
    }

    /** @param array<string, mixed> $payload */
    private function create(array $payload): PickupRequest
    {
        return DB::transaction(function () use ($payload) {
            $mode = IntakeMode::from($payload['intake_mode']);
            $location = isset($payload['service_location_id'])
                ? ServiceLocation::query()->where('is_active', true)->find($payload['service_location_id'])
                : null;

            if ($mode->requiresServiceLocation() && $location === null) {
                throw ValidationException::withMessages([
                    'service_location_id' => 'La sede seleccionada no existe o está inactiva.',
                ]);
            }

            if ($mode->requiresFieldAssignment() && blank($payload['pickup_address_line1'] ?? null)) {
                throw ValidationException::withMessages([
                    'pickup_address_line1' => 'La recogida en el local requiere dirección.',
                ]);
            }

            $packages = $payload['packages'];
            $request = PickupRequest::query()->create([
                'pickup_code' => $this->nextCode(),
                'customer_id' => $payload['customer_id'],
                'source' => $payload['source'],
                'intake_mode' => $mode,
                'service_location_id' => $location?->id,
                'planned_dropoff_at' => $payload['planned_dropoff_at'] ?? null,
                'status' => 'submitted',
                'pickup_address_line1' => $payload['pickup_address_line1'] ?? $location?->address_line1,
                'pickup_address_complement' => $payload['pickup_address_complement'] ?? $location?->address_complement,
                'pickup_zone' => $payload['pickup_zone'] ?? $location?->zone,
                'pickup_city' => $payload['pickup_city'] ?? $location?->city,
                'pickup_lat' => $payload['pickup_lat'] ?? $location?->lat,
                'pickup_lng' => $payload['pickup_lng'] ?? $location?->lng,
                'contact_name' => $payload['contact_name'],
                'contact_phone' => $payload['contact_phone'],
                'pickup_window_code' => $payload['pickup_window_code'] ?? ($mode === IntakeMode::WALK_IN_AT_HUB ? 'NOW' : 'TO_CONFIRM'),
                'pickup_window_label' => $payload['pickup_window_label'] ?? ($mode === IntakeMode::WALK_IN_AT_HUB ? 'Ingreso inmediato' : 'Por confirmar'),
                'package_count' => count($packages),
                'requested_cod_total' => array_sum(array_map(
                    fn (array $package) => (int) ($package['requested_cod_amount'] ?? 0),
                    $packages,
                )),
                'special_instructions' => $payload['special_instructions'] ?? null,
                'correlation_id' => (string) Str::uuid(),
                'submitted_at' => now(),
            ]);

            foreach ($packages as $index => $package) {
                PickupPackage::query()->create(array_merge($package, [
                    'pickup_request_id' => $request->id,
                    'package_index' => $index + 1,
                    'is_cod' => (bool) ($package['is_cod'] ?? false),
                    'requested_cod_amount' => (int) ($package['requested_cod_amount'] ?? 0),
                    'is_fragile' => (bool) ($package['is_fragile'] ?? false),
                ]));
            }

            $this->tasks->createForPickupRequest($request);

            AuditLog::log(
                'operations.pickup_created',
                $request,
                null,
                $request->only(['pickup_code', 'source', 'intake_mode', 'service_location_id', 'package_count']),
                'Solicitud de recogida creada por el caso de uso multicanal.',
            );

            return $request;
        });
    }

    private function nextCode(): string
    {
        do {
            $code = 'PR-'.now()->format('ymd').'-'.Str::upper(Str::random(6));
        } while (PickupRequest::query()->where('pickup_code', $code)->exists());

        return $code;
    }
}
