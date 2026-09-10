<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Driver\Models\Driver;
use App\Domain\Shared\Models\IdempotencyRecord;
use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Actions\TransitionShipmentStatus;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\CustodyReview;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

class DriverReceptionService
{
    private const IDEMPOTENCY_OPERATION = 'driver_reception_confirm';

    public function __construct(
        private readonly RouteDispatchService $dispatch,
        private readonly TransitionShipmentStatus $transitionShipmentStatus,
        private readonly CustodyRecorder $custody,
    ) {}

    /** @return array<string, mixed> */
    public function validateScan(string $scanCode, int $driverId): array
    {
        $scanCode = trim($scanCode);
        $shipment = $this->dispatch->findShipmentByScanCode($scanCode);

        if ($shipment === null) {
            return $this->rejected($scanCode, null, 'not_found', 'No encontramos un paquete con ese código. Revisa la guía e inténtalo de nuevo.');
        }

        $reason = $this->rejectionReason($shipment, $driverId);
        if ($reason !== null) {
            return $this->rejected($scanCode, $shipment, $reason['code'], $reason['message']);
        }

        return [
            'accepted' => true,
            'scan_code' => $scanCode,
            'package' => $this->packagePayload($shipment),
            'reason_code' => null,
            'reason' => null,
        ];
    }

    /**
     * @param  array{device_id:string,lat:float|int,lng:float|int,occurred_at:string,packages:array<int,array{scan_code:string,physical_condition?:string|null}>}  $payload
     * @return array<string, mixed>
     */
    public function confirm(Driver $driver, User $actor, array $payload, string $idempotencyKey): array
    {
        $scope = "driver-reception:{$driver->id}";
        $payload = $this->canonicalPayload($payload);
        $hash = hash('sha256', json_encode($this->canonicalize($payload), JSON_THROW_ON_ERROR));
        $existingResponse = $this->acquireBatch($scope, $idempotencyKey, $hash);

        if ($existingResponse !== null) {
            return $existingResponse;
        }

        $accepted = [];
        $rejected = [];

        foreach ($payload['packages'] as $package) {
            try {
                $result = $this->confirmOne(
                    $driver,
                    $actor,
                    $package,
                    $payload,
                    $scope,
                    $idempotencyKey,
                );
            } catch (Throwable $exception) {
                Log::error('driver_reception_confirm.package_failed', [
                    'scan_code' => $package['scan_code'],
                    'driver_id' => $driver->id,
                    'exception' => $exception,
                ]);
                $result = $this->rejected(
                    $package['scan_code'],
                    null,
                    'processing_error',
                    'No pudimos recibir este paquete. Intenta escanearlo de nuevo.',
                );
            }

            if ($result['accepted']) {
                $accepted[] = $result;
            } else {
                $rejected[] = $result;
            }
        }

        $response = [
            'accepted' => $accepted,
            'rejected' => $rejected,
            'summary' => [
                'accepted_count' => count($accepted),
                'rejected_count' => count($rejected),
            ],
        ];

        $this->completeBatch($scope, $idempotencyKey, $hash, $response);

        return $response;
    }

    /**
     * @param  array{scan_code:string,physical_condition?:string|null}  $package
     * @param  array<string, mixed>  $batch
     * @return array<string, mixed>
     */
    private function confirmOne(
        Driver $driver,
        User $actor,
        array $package,
        array $batch,
        string $scope,
        string $idempotencyKey,
    ): array {
        return DB::transaction(function () use ($driver, $actor, $package, $batch, $scope, $idempotencyKey): array {
            $scanCode = $package['scan_code'];
            $shipment = $this->dispatch->findShipmentByScanCode($scanCode, true);

            if ($shipment === null) {
                return $this->rejected($scanCode, null, 'not_found', 'No encontramos un paquete con ese código. Revisa la guía e inténtalo de nuevo.');
            }

            $latestCustody = $this->latestCustody($shipment);
            if ($this->belongsToThisBatch($latestCustody, $driver->id, $scope, $idempotencyKey)) {
                return $this->accepted($scanCode, $shipment, $latestCustody);
            }

            // La custodia manda: si el paquete ya está en la moto de quien
            // escanea, no hay nada que mover y el reescaneo es inofensivo.
            $custodyAlreadyMine = $latestCustody?->new_custodian_type === 'driver'
                && (int) $latestCustody->new_custodian_id === $driver->id;

            $correlation = 'auto_assigned';
            $previousDriver = null;
            if ($latestCustody?->new_custodian_type === 'driver' && ! $custodyAlreadyMine) {
                $correlation = 'transferred';
                $previousDriver = (int) $latestCustody->new_custodian_id;
            } elseif ($this->hasOpenStopFor($shipment, $driver->id)) {
                $correlation = 'checked';
            } elseif (! $custodyAlreadyMine) {
                $reason = $this->rejectionReason($shipment, $driver->id, $latestCustody, true);
                if ($reason !== null) {
                    return $this->rejected($scanCode, $shipment, $reason['code'], $reason['message']);
                }
            }

            // "Chequeado" significa "además coincide con tu asignación", no
            // "no hay nada que hacer": si la custodia sigue en la sede, el
            // escaneo la mueve igual. Solo se sale temprano cuando el paquete
            // ya estaba en manos de este piloto.
            if ($custodyAlreadyMine) {
                return $this->accepted($scanCode, $shipment, $latestCustody, $correlation);
            }

            $shipment->update(['driver_id' => $driver->id]);
            $shipment = $this->transitionShipmentStatus->execute(
                $shipment,
                ShipmentStatus::HANDED_TO_DRIVER,
                $actor,
                'Paquete recibido por el piloto mediante escaneo.',
                [
                    'action' => 'driver_reception_confirm',
                    'device_id' => $batch['device_id'],
                    'scan_code' => $scanCode,
                ],
            );

            $custody = $this->custody->record($shipment, [
                'event_type' => $correlation === 'transferred' ? 'custody_transferred' : 'assigned_to_driver',
                'previous_custodian_type' => $latestCustody?->new_custodian_type ?: 'hub',
                'previous_custodian_id' => $latestCustody?->new_custodian_id,
                'new_custodian_type' => 'driver',
                'new_custodian_id' => $driver->id,
                'new_custodian_name' => $driver->name,
                'physical_condition' => $package['physical_condition'] ?? null,
                'actor_user_id' => $actor->id,
                'lat' => $batch['lat'],
                'lng' => $batch['lng'],
                'occurred_at' => $batch['occurred_at'],
                'metadata_json' => [
                    'source' => 'driver_reception_scan',
                    'device_id' => $batch['device_id'],
                    'scan_code' => $scanCode,
                    'idempotency_scope' => $scope,
                    'idempotency_key' => $idempotencyKey,
                ],
            ]);

            $this->correlateRoute($shipment, $driver->id, $correlation, $previousDriver, $custody);

            return $this->accepted($scanCode, $shipment, $custody, $correlation, $previousDriver);
        });
    }

    /** @return array{code:string,message:string}|null */
    private function rejectionReason(Shipment $shipment, int $driverId, ?CustodyEvent $latestCustody = null, bool $allowTransfer = false): ?array
    {
        $status = $shipment->status;

        if ($status === ShipmentStatus::DELIVERED) {
            return ['code' => 'already_delivered', 'message' => 'Este paquete ya fue entregado al destinatario.'];
        }

        if ($status === ShipmentStatus::CANCELLED) {
            return ['code' => 'cancelled', 'message' => 'Este paquete está cancelado y no puede entregarse al piloto.'];
        }

        $latestCustody ??= $this->latestCustody($shipment);
        if ($latestCustody?->new_custodian_type === 'driver') {
            if ((int) $latestCustody->new_custodian_id === $driverId) {
                return ['code' => 'already_received_by_driver', 'message' => 'Este paquete ya está bajo tu custodia.'];
            }

            if (! $allowTransfer) {
                return ['code' => 'other_driver_custody', 'message' => 'Este paquete está físicamente en poder de otro piloto.'];
            }
        }

        if ($latestCustody === null || $latestCustody->new_custodian_type !== 'hub') {
            return ['code' => 'not_in_hub_custody', 'message' => 'Este paquete no figura bajo custodia de la sede.'];
        }

        if ($shipment->driver_id !== null && (int) $shipment->driver_id !== $driverId) {
            if (! $allowTransfer) {
                return ['code' => 'assigned_to_other_driver', 'message' => 'Este paquete está asignado a otro piloto. Pide al operador que revise la asignación.'];
            }
        }

        if (! in_array($status, [ShipmentStatus::PICKED_UP, ShipmentStatus::IN_WAREHOUSE], true)) {
            return ['code' => 'status_not_eligible', 'message' => "El paquete está {$status->label()} y ese estado no permite recibirlo."];
        }

        return null;
    }

    private function latestCustody(Shipment $shipment): ?CustodyEvent
    {
        return CustodyEvent::query()
            ->where('shipment_id', $shipment->id)
            ->latest('occurred_at')
            ->latest('id')
            ->first();
    }

    /**
     * ¿El paquete está asignado a este piloto en una salida viva?
     *
     * Se resuelve por la parada de la salida y no por `shipments.driver_id`:
     * ese campo sobrevive a la devolución a bodega, así que un paquete que ya
     * volvió a la sede seguía apareciendo como "asignado" a su piloto anterior.
     */
    private function hasOpenStopFor(Shipment $shipment, int $driverId): bool
    {
        return RouteStop::query()
            ->where('shipment_id', $shipment->id)
            ->whereHas('route', fn ($query) => $query
                ->where('driver_id', $driverId)
                ->whereIn('status', ['planned', 'active']))
            ->exists();
    }

    private function belongsToThisBatch(
        ?CustodyEvent $custody,
        int $driverId,
        string $scope,
        string $idempotencyKey,
    ): bool {
        return $custody?->new_custodian_type === 'driver'
            && (int) $custody->new_custodian_id === $driverId
            && ($custody->metadata_json['idempotency_scope'] ?? null) === $scope
            && ($custody->metadata_json['idempotency_key'] ?? null) === $idempotencyKey;
    }

    /** @return array<string, mixed> */
    private function accepted(string $scanCode, Shipment $shipment, CustodyEvent $custody, string $correlation = 'checked', ?int $previousDriver = null): array
    {
        return [
            'accepted' => true,
            'scan_code' => $scanCode,
            'correlation' => $correlation,
            'previous_driver' => $previousDriver,
            'package' => $this->packagePayload($shipment->fresh()),
            'custody_event' => [
                'id' => $custody->id,
                'event_type' => $custody->event_type,
                'previous_custodian_type' => $custody->previous_custodian_type,
                'previous_custodian_id' => $custody->previous_custodian_id,
                'new_custodian_type' => $custody->new_custodian_type,
                'new_custodian_id' => $custody->new_custodian_id,
                'lat' => $custody->lat,
                'lng' => $custody->lng,
                'occurred_at' => $custody->occurred_at?->toISOString(),
            ],
        ];
    }

    private function correlateRoute(Shipment $shipment, int $driverId, string $correlation, ?int $previousDriver, CustodyEvent $custody): void
    {
        $date = now()->toDateString();
        $old = RouteStop::query()->where('shipment_id', $shipment->id)->whereHas('route', fn ($q) => $q->whereIn('status', ['planned', 'active']))->get();
        if ($correlation === 'checked') {
            return;
        }
        $old->each(function ($s) {
            if ($s->route && $s->route->status === 'planned') {
                $s->delete();
                $s->route->syncStopsCounts();
            }
        });
        $route = Route::query()->where('driver_id', $driverId)->whereDate('route_date', $date)->where('status', 'planned')->first();
        if (! $route) {
            $route = Route::create(['driver_id' => $driverId, 'route_date' => $date, 'status' => 'planned', 'total_stops' => 0, 'completed_stops' => 0]);
        }
        if ($route->status === 'active') {
            return;
        }
        if (! RouteStop::where('route_id', $route->id)->where('shipment_id', $shipment->id)->exists()) {
            RouteStop::create(['route_id' => $route->id, 'shipment_id' => $shipment->id, 'sort_order' => (int) ($route->stops()->max('sort_order') ?? 0) + 1, 'status' => 'pending']);
        }
        $route->syncStopsCounts();
        $reviewType = $correlation === 'transferred' ? 'custody_transferred' : 'auto_assigned_by_scan';
        $notificationType = $correlation === 'transferred' ? 'custody_transfer' : 'qr_auto_assignment';
        CustodyReview::create(['shipment_id' => $shipment->id, 'type' => $reviewType, 'previous_driver_id' => $previousDriver, 'new_driver_id' => $driverId, 'custody_event_id' => $custody->id, 'status' => 'pending', 'occurred_at' => $custody->occurred_at, 'metadata' => ['correlation' => $correlation]]);
        Notification::sendToRole('admin', $notificationType, 'Revisión de custodia pendiente', 'Un paquete requiere revisión.', '/revisiones');
    }

    /** @return array<string, mixed> */
    private function rejected(string $scanCode, ?Shipment $shipment, string $reasonCode, string $reason): array
    {
        return [
            'accepted' => false,
            'scan_code' => $scanCode,
            'package' => $shipment === null ? null : $this->packagePayload($shipment),
            'reason_code' => $reasonCode,
            'reason' => $reason,
        ];
    }

    /** @return array<string, mixed> */
    private function packagePayload(Shipment $shipment): array
    {
        return [
            'id' => $shipment->id,
            'tracking_code' => $shipment->tracking_code,
            'display_code' => $shipment->display_code,
            'recipient_name' => $shipment->recipient_name,
            'recipient_zone' => $shipment->recipient_zone,
            'status' => $shipment->status->value,
            'status_label' => $shipment->status->label(),
        ];
    }

    /** @param array<string, mixed> $payload */
    private function canonicalPayload(array $payload): array
    {
        $payload['device_id'] = trim($payload['device_id']);
        $payload['lat'] = (float) $payload['lat'];
        $payload['lng'] = (float) $payload['lng'];
        $payload['packages'] = array_map(static fn (array $package): array => [
            'scan_code' => trim($package['scan_code']),
            'physical_condition' => $package['physical_condition'] ?? null,
        ], $payload['packages']);

        return $payload;
    }

    /** @return array<string, mixed>|null */
    private function acquireBatch(string $scope, string $key, string $hash): ?array
    {
        try {
            return DB::transaction(function () use ($scope, $key, $hash): ?array {
                $record = IdempotencyRecord::query()
                    ->where('scope', $scope)
                    ->where('idempotency_key', $key)
                    ->where('operation', self::IDEMPOTENCY_OPERATION)
                    ->lockForUpdate()
                    ->first();

                if ($record !== null) {
                    if (! hash_equals($record->request_hash, $hash)) {
                        throw ValidationException::withMessages([
                            'idempotency_key' => 'La llave ya fue usada con un contenido diferente.',
                        ]);
                    }

                    if ($record->status !== 'completed' || ! is_array($record->response_json)) {
                        throw ValidationException::withMessages([
                            'idempotency_key' => 'La recepción con esta llave todavía está en proceso.',
                        ]);
                    }

                    return $record->response_json;
                }

                IdempotencyRecord::query()->create([
                    'scope' => $scope,
                    'idempotency_key' => $key,
                    'operation' => self::IDEMPOTENCY_OPERATION,
                    'request_hash' => $hash,
                    'status' => 'processing',
                    'expires_at' => now()->addDays(7),
                ]);

                return null;
            });
        } catch (QueryException $exception) {
            $exists = IdempotencyRecord::query()
                ->where('scope', $scope)
                ->where('idempotency_key', $key)
                ->where('operation', self::IDEMPOTENCY_OPERATION)
                ->exists();

            if (! $exists) {
                throw $exception;
            }

            return $this->acquireBatch($scope, $key, $hash);
        }
    }

    /** @param array<string, mixed> $response */
    private function completeBatch(string $scope, string $key, string $hash, array $response): void
    {
        DB::transaction(function () use ($scope, $key, $hash, $response): void {
            $record = IdempotencyRecord::query()
                ->where('scope', $scope)
                ->where('idempotency_key', $key)
                ->where('operation', self::IDEMPOTENCY_OPERATION)
                ->lockForUpdate()
                ->firstOrFail();

            if (! hash_equals($record->request_hash, $hash)) {
                throw ValidationException::withMessages([
                    'idempotency_key' => 'La llave ya fue usada con un contenido diferente.',
                ]);
            }

            $record->update([
                'status' => 'completed',
                'response_json' => $response,
                'completed_at' => now(),
            ]);
        });
    }

    /** @param array<string, mixed> $payload */
    private function canonicalize(array $payload): array
    {
        ksort($payload);

        foreach ($payload as $key => $value) {
            if (is_array($value)) {
                $payload[$key] = array_is_list($value)
                    ? array_map(fn ($item) => is_array($item) ? $this->canonicalize($item) : $item, $value)
                    : $this->canonicalize($value);
            }
        }

        return $payload;
    }
}
