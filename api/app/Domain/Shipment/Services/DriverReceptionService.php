<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Driver\Models\Driver;
use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Actions\TransitionShipmentStatus;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\CustodyReview;
use App\Domain\Shipment\Models\CustodyTransferRequest;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
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
        private readonly CustodyBatch $batches,
        private readonly CustodyGuard $guard,
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

        $holder = $this->guard->holdingDriver($shipment);
        $requiresAcceptance = $holder !== null && $holder['id'] !== $driverId
            && $this->onActiveRouteOf($shipment, $holder['id']);
        $pending = $requiresAcceptance ? $this->pendingRequest($shipment) : null;

        return [
            'accepted' => true,
            'scan_code' => $scanCode,
            'previous_driver' => $this->previousDriverPayload($shipment, $driverId),
            'package' => $this->packagePayload($shipment),
            'reason_code' => null,
            'reason' => null,
            'requires_acceptance' => $requiresAcceptance,
            'transfer_request' => $pending && (int) $pending->to_driver_id === $driverId ? $this->transferRequestPayload($pending) : null,
            'warning' => $requiresAcceptance
                ? "Lo tiene {$holder['name']} en ruta. Al tomarlo le pediremos que acepte."
                : $this->scanWarning($shipment, $driverId),
        ];
    }

    /**
     * Contrato 2026-09-26-B §1: el paquete está en una parada pendiente de una
     * salida ACTIVA del piloto que lo tiene. En ese caso el traspaso espera a
     * que ese piloto acepte.
     */
    public function onActiveRouteOf(Shipment $shipment, int $holderDriverId): bool
    {
        return RouteStop::query()
            ->where('shipment_id', $shipment->id)
            ->where('status', 'pending')
            ->whereHas('route', fn ($q) => $q->where('status', 'active')->where('driver_id', $holderDriverId))
            ->exists();
    }

    /** Solicitud pendiente y vigente del paquete (vence las atrasadas antes de mirar). */
    private function pendingRequest(Shipment $shipment, bool $lock = false): ?CustodyTransferRequest
    {
        CustodyTransferRequest::expireOverdue((int) $shipment->id);

        $query = CustodyTransferRequest::query()
            ->where('shipment_id', $shipment->id)
            ->where('status', CustodyTransferRequest::PENDING)
            ->latest('id');

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->first();
    }

    /** @return array{id:int,status:string,expires_at:?string} */
    private function transferRequestPayload(CustodyTransferRequest $request): array
    {
        return [
            'id' => (int) $request->id,
            'status' => $request->status,
            'expires_at' => $request->expires_at?->toIso8601String(),
        ];
    }

    /**
     * Crea (o reutiliza si B vuelve a escanear) la solicitud para que A acepte.
     * No mueve la custodia.
     *
     * @param  array<string, mixed>  $batch
     * @return array<string, mixed>
     */
    private function requestAcceptance(Shipment $shipment, Driver $driver, User $actor, int $holderId, string $scanCode, array $package, array $batch): array
    {
        $request = $this->pendingRequest($shipment, true);
        $holderName = $this->guard->driverName($holderId);

        if ($request === null || (int) $request->to_driver_id !== $driver->id || (int) $request->from_driver_id !== $holderId) {
            if ($request !== null) {
                // Otro destino u otro dueño: no debería pasar (rejectionReason
                // ya bloquea a C), pero nunca se dejan dos pendientes.
                $request->update(['status' => CustodyTransferRequest::CANCELLED, 'responded_at' => now()]);
            }

            $request = CustodyTransferRequest::create([
                'shipment_id' => $shipment->id,
                'from_driver_id' => $holderId,
                'to_driver_id' => $driver->id,
                'status' => CustodyTransferRequest::PENDING,
                'requested_by_user_id' => $actor->id,
                'requested_at' => now(),
                'expires_at' => now()->addMinutes(CustodyTransferRequest::TTL_MINUTES),
                'metadata_json' => [
                    'scan_code' => $scanCode,
                    'physical_condition' => $package['physical_condition'] ?? null,
                    'device_id' => $batch['device_id'] ?? null,
                    'lat' => $batch['lat'] ?? null,
                    'lng' => $batch['lng'] ?? null,
                ],
            ]);

            $code = $this->packageLabel($shipment);
            $newName = $this->guard->driverName($driver->id);
            $holderUserId = $this->pilotUserId($holderId);
            if ($holderUserId !== null) {
                Notification::send($holderUserId, 'custody_transfer_request', 'Te piden un paquete',
                    "{$newName} quiere tomar el paquete {$code}. ¿Se lo entregaste?", null,
                    ['transfer_request_id' => $request->id, 'shipment_id' => $shipment->id]);
            }
            Notification::sendToAdmins('custody_transfer_request', 'Solicitud de cambio de piloto',
                "{$newName} pide el paquete {$code} que tiene {$holderName}", '/revisiones');
        }

        return [
            'accepted' => false,
            'scan_code' => $scanCode,
            'correlation' => 'pending_acceptance',
            'previous_driver' => ['id' => $holderId, 'name' => $holderName],
            'package' => $this->packagePayload($shipment),
            'transfer_request' => $this->transferRequestPayload($request),
            'reason_code' => 'pending_acceptance',
            'reason' => "Le pedimos a {$holderName} que acepte. Te avisamos cuando responda.",
        ];
    }

    /** Usuario de la app del piloto, para avisarle. */
    public function pilotUserId(int $driverId): ?int
    {
        $userId = Driver::withTrashed()->whereKey($driverId)->value('user_id');
        if ($userId) {
            return (int) $userId;
        }
        $userId = User::query()->where('driver_id', $driverId)->value('id');

        return $userId ? (int) $userId : null;
    }

    /**
     * Ejecuta el traspaso de A a B (misma lógica que el traspaso inmediato por
     * escaneo). Lo usa la aceptación de A y la aprobación de administración.
     * El llamador debe tener el envío bloqueado dentro de una transacción.
     *
     * @param  array{physical_condition?:string|null,lat?:float|null,lng?:float|null,metadata?:array<string,mixed>,notification_suffix?:string,review_metadata?:array<string,mixed>}  $context
     */
    public function executeTransfer(Shipment $shipment, Driver $to, User $actor, CustodyEvent $latest, array $context = []): CustodyEvent
    {
        return $this->takeCustody($shipment, $to, $actor, $latest, 'transferred', (int) $latest->new_custodian_id, [
            'physical_condition' => $context['physical_condition'] ?? null,
            'lat' => $context['lat'] ?? null,
            'lng' => $context['lng'] ?? null,
            'transition_metadata' => ['action' => 'custody_transfer_request'] + ($context['metadata'] ?? []),
            'custody_metadata' => ['source' => 'custody_transfer_request'] + ($context['metadata'] ?? []),
            'notification_suffix' => $context['notification_suffix'] ?? '',
            'review_metadata' => $context['review_metadata'] ?? [],
            'transfer_request_id' => $context['metadata']['transfer_request_id'] ?? null,
        ]);
    }

    /**
     * Mueve la custodia al piloto `$driver`: retira la parada de la salida
     * activa ajena (si es traspaso), cambia el estado, registra la custodia y
     * correlaciona la ruta planeada.
     *
     * @param  array<string, mixed>  $ctx
     */
    private function takeCustody(Shipment $shipment, Driver $driver, User $actor, ?CustodyEvent $latestCustody, string $correlation, ?int $previousDriver, array $ctx): CustodyEvent
    {
        $withdrawnRouteIds = $correlation === 'transferred'
            ? $this->withdrawFromOtherRoutes($shipment, $driver->id)
            : [];

        $shipment->update(['driver_id' => $driver->id]);
        if ($shipment->status !== ShipmentStatus::HANDED_TO_DRIVER) {
            $shipment = $this->transitionShipmentStatus->execute(
                $shipment,
                ShipmentStatus::HANDED_TO_DRIVER,
                $actor,
                'Paquete recibido por el piloto mediante escaneo.',
                $ctx['transition_metadata'] ?? [],
            );
        }

        $custody = $this->custody->record($shipment, [
            'event_type' => $correlation === 'transferred' ? 'custody_transferred' : 'assigned_to_driver',
            'previous_custodian_type' => $latestCustody?->new_custodian_type ?: 'hub',
            'previous_custodian_id' => $latestCustody?->new_custodian_id,
            'new_custodian_type' => 'driver',
            'new_custodian_id' => $driver->id,
            'new_custodian_name' => $driver->name,
            'physical_condition' => $ctx['physical_condition'] ?? null,
            'actor_user_id' => $actor->id,
            'lat' => $ctx['lat'] ?? null,
            'lng' => $ctx['lng'] ?? null,
            'occurred_at' => now(),
            'metadata_json' => ($ctx['custody_metadata'] ?? []) + ['withdrawn_route_ids' => $withdrawnRouteIds],
        ]);

        $this->correlateRoute($shipment, $driver->id, $correlation, $previousDriver, $custody,
            (string) ($ctx['notification_suffix'] ?? ''), $ctx['review_metadata'] ?? []);

        // El paquete ya cambió de manos: cualquier otra solicitud abierta
        // sobre él pierde sentido.
        CustodyTransferRequest::query()
            ->where('shipment_id', $shipment->id)
            ->where('status', CustodyTransferRequest::PENDING)
            ->when(isset($ctx['transfer_request_id']), fn ($q) => $q->whereKeyNot($ctx['transfer_request_id']))
            ->update(['status' => CustodyTransferRequest::CANCELLED, 'responded_at' => now(), 'updated_at' => now()]);

        return $custody;
    }

    /**
     * @param  array{device_id:string,lat:float|int,lng:float|int,occurred_at:string,packages:array<int,array{scan_code:string,physical_condition?:string|null}>}  $payload
     * @return array<string, mixed>
     */
    public function confirm(Driver $driver, User $actor, array $payload, string $idempotencyKey): array
    {
        $scope = "driver-reception:{$driver->id}";
        $payload = $this->canonicalPayload($payload);

        return $this->batches->run($scope, $idempotencyKey, self::IDEMPOTENCY_OPERATION, $payload, function () use ($driver, $actor, $payload, $scope, $idempotencyKey): array {
            Driver::whereKey($driver->id)->lockForUpdate()->firstOrFail();
            $seen = [];
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
                        $seen,
                    );
                } catch (ValidationException $exception) {
                    // La cadena de custodia cambió entre la lectura y la
                    // escritura (otro escaneo ganó la carrera). No es un error
                    // del sistema: se le pide al piloto que lo vuelva a leer.
                    Log::warning('driver_reception_confirm.custody_changed', [
                        'scan_code' => $package['scan_code'],
                        'driver_id' => $driver->id,
                        'errors' => $exception->errors(),
                    ]);
                    $result = $this->rejected(
                        $package['scan_code'],
                        null,
                        'custody_changed',
                        'La custodia de este paquete cambió mientras lo escaneabas. Escanéalo de nuevo.',
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

            // Las solicitudes pendientes de aceptación viajan en `rejected`
            // (accepted: false) para que las APK viejas las muestren con su
            // mensaje; la app nueva las pinta en ámbar por `correlation`.
            $response = [
                'accepted' => $accepted,
                'rejected' => $rejected,
                'summary' => [
                    'accepted_count' => count($accepted),
                    'rejected_count' => count($rejected),
                    'pending_count' => count(array_filter($rejected, fn (array $item) => ($item['correlation'] ?? null) === 'pending_acceptance')),
                ],
            ];

            return $response;
        });
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
        array &$seen,
    ): array {
        return DB::transaction(function () use ($driver, $actor, $package, $batch, $scope, $idempotencyKey, &$seen): array {
            $scanCode = $package['scan_code'];
            $shipment = $this->dispatch->findShipmentByScanCode($scanCode, true);

            if ($shipment === null) {
                return $this->rejected($scanCode, null, 'not_found', 'No encontramos un paquete con ese código. Revisa la guía e inténtalo de nuevo.');
            }

            if (isset($seen[$shipment->id])) {
                return $this->rejected($scanCode, $shipment, 'duplicate_package', 'Este paquete ya está incluido en el lote con otro código.');
            }
            $seen[$shipment->id] = true;
            $reason = $this->rejectionReason($shipment, $driver->id);
            if ($reason !== null) {
                return $this->rejected($scanCode, $shipment, $reason['code'], $reason['message']);
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
            $previousDriver = $shipment->driver_id ? (int) $shipment->driver_id : null;
            if ($latestCustody?->new_custodian_type === 'driver' && ! $custodyAlreadyMine) {
                $correlation = 'transferred';
                $previousDriver = (int) $latestCustody->new_custodian_id;
            } elseif ($this->hasOpenStopFor($shipment, $driver->id)) {
                $correlation = 'checked';
            }

            // "Chequeado" significa "además coincide con tu asignación", no
            // "no hay nada que hacer": si la custodia sigue en la sede, el
            // escaneo la mueve igual. Solo se sale temprano cuando el paquete
            // ya estaba en manos de este piloto.
            if ($custodyAlreadyMine) {
                return $this->accepted($scanCode, $shipment, $latestCustody, $correlation);
            }

            // Regla del dueño: si A ya arrancó ruta con el paquete, se le pide
            // que acepte; si no, B lo toma de una vez.
            if ($correlation === 'transferred' && $this->onActiveRouteOf($shipment, (int) $previousDriver)) {
                return $this->requestAcceptance($shipment, $driver, $actor, (int) $previousDriver, $scanCode, $package, $batch);
            }

            $custody = $this->takeCustody($shipment, $driver, $actor, $latestCustody, $correlation, $previousDriver, [
                'physical_condition' => $package['physical_condition'] ?? null,
                'lat' => $batch['lat'],
                'lng' => $batch['lng'],
                'transition_metadata' => [
                    'action' => 'driver_reception_confirm',
                    'device_id' => $batch['device_id'],
                    'scan_code' => $scanCode,
                ],
                'custody_metadata' => [
                    'source' => 'driver_reception_scan',
                    'device_occurred_at' => $batch['occurred_at'],
                    'device_id' => $batch['device_id'],
                    'scan_code' => $scanCode,
                    'idempotency_scope' => $scope,
                    'idempotency_key' => $idempotencyKey,
                ],
            ]);

            return $this->accepted($scanCode, $shipment, $custody, $correlation, $previousDriver);
        });
    }

    /** @return array{code:string,message:string}|null */
    private function rejectionReason(Shipment $shipment, int $driverId): ?array
    {
        $status = $shipment->status;
        if ($status->isTerminal()) {
            return ['code' => $status === ShipmentStatus::DELIVERED ? 'already_delivered' : $status->value,
                'message' => "El paquete está {$status->label()} y no puede tomarse."];
        }
        $latest = $this->latestCustody($shipment);
        if ($latest?->new_custodian_type === 'driver' && (int) $latest->new_custodian_id === $driverId) {
            return null; // Reescaneo propio, sin duplicar custodia.
        }
        if (! $latest || ! in_array($latest->new_custodian_type, ['hub', 'driver'], true)) {
            return ['code' => 'not_in_hub_custody', 'message' => 'No hay custodia de sede o piloto que permita esta recepción.'];
        }
        // Solo una solicitud pendiente por paquete: si otro piloto ya lo pidió,
        // este escaneo espera la respuesta.
        $pending = $this->pendingRequest($shipment);
        if ($pending !== null && (int) $pending->to_driver_id !== $driverId) {
            $requester = $this->guard->driverName((int) $pending->to_driver_id);
            $holder = $this->guard->driverName((int) $pending->from_driver_id);

            return ['code' => 'transfer_pending', 'message' => "{$requester} ya pidió este paquete a {$holder}. Espera a que responda."];
        }
        // Contrato 2026-09-26 §4: si otro piloto lo tiene en su salida activa,
        // quien lo escanea con el paquete en la mano se lo queda; la parada se
        // retira de la ruta anterior al confirmar. Solo se bloquea la salida
        // activa cuando el paquete sigue en sede (algo no cuadra).
        $heldByOtherDriver = $latest->new_custodian_type === 'driver';
        if (! $heldByOtherDriver && RouteStop::where('shipment_id', $shipment->id)->whereHas('route', fn ($q) => $q->where('status', 'active'))->exists()) {
            return ['code' => 'active_route', 'message' => 'El paquete está en una ruta activa. Finaliza esa salida antes de cambiar su custodia.'];
        }
        $eligible = [ShipmentStatus::PICKED_UP, ShipmentStatus::IN_WAREHOUSE, ShipmentStatus::ASSIGNED_TO_ROUTE, ShipmentStatus::HANDED_TO_DRIVER];
        if ($heldByOtherDriver) {
            $eligible[] = ShipmentStatus::IN_TRANSIT;
        }
        if (! in_array($status, $eligible, true)) {
            return ['code' => 'status_not_eligible', 'message' => "El paquete está {$status->label()} y ese estado no permite recibirlo."];
        }

        return null;
    }

    private function scanWarning(Shipment $shipment, int $driverId): ?string
    {
        $latest = $this->latestCustody($shipment);
        if ($latest?->new_custodian_type === 'driver') {
            if ((int) $latest->new_custodian_id === $driverId) {
                return 'Ya está bajo tu custodia; confirmar no duplicará el movimiento.';
            }

            $name = $this->guard->driverName((int) $latest->new_custodian_id, $latest->new_custodian_name);

            return "Está con {$name}. Confirma solo si lo tienes físicamente; pasará a tu cargo y administración recibirá el cambio.";
        }

        if ($shipment->driver_id && (int) $shipment->driver_id !== $driverId) {
            $name = $this->guard->driverName((int) $shipment->driver_id);

            return "Asignado a {$name}. Al confirmar quedará a tu cargo y administración recibirá el cambio.";
        }

        return null;
    }

    /**
     * Piloto que tenía el paquete antes de este escaneo, para que la app lo
     * nombre. Solo cuando es otro piloto: la sede no cuenta.
     *
     * @return array{id:int,name:string}|null
     */
    private function previousDriverPayload(Shipment $shipment, int $driverId, ?int $previousDriverId = null): ?array
    {
        // Solo la custodia física cuenta: una simple asignación a otro piloto
        // no es "estaba con" (para eso está el aviso).
        $previousDriverId ??= $this->guard->holdingDriver($shipment)['id'] ?? null;

        if ($previousDriverId === null || $previousDriverId === $driverId) {
            return null;
        }

        return ['id' => $previousDriverId, 'name' => $this->guard->driverName($previousDriverId)];
    }

    /**
     * Retira el paquete de la salida ACTIVA de otro piloto cuando cambia de
     * manos por escaneo. La parada se elimina (no queda como entregada ni como
     * pendiente del piloto anterior); el rastro vive en el evento de custodia
     * `custody_transferred`, que guarda las rutas de las que se retiró. Las
     * rutas planificadas las sigue limpiando `correlateRoute`.
     *
     * @return array<int, int> ids de las rutas de las que se retiró
     */
    private function withdrawFromOtherRoutes(Shipment $shipment, int $driverId): array
    {
        $stops = RouteStop::with('route')
            ->where('shipment_id', $shipment->id)
            ->where('status', 'pending')
            ->whereHas('route', fn ($q) => $q->where('status', 'active')->where('driver_id', '!=', $driverId))
            ->get();

        $routeIds = [];
        foreach ($stops as $stop) {
            $route = $stop->route;
            $stop->delete();
            if ($route) {
                $route->syncStopsCounts();
                $routeIds[] = (int) $route->id;
            }
        }

        return $routeIds;
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
            'previous_driver' => $this->previousDriverPayload($shipment, (int) $custody->new_custodian_id, $correlation === 'transferred' ? $previousDriver : null),
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

    /** @param array<string, mixed> $reviewMetadata */
    private function correlateRoute(Shipment $shipment, int $driverId, string $correlation, ?int $previousDriver, CustodyEvent $custody, string $notificationSuffix = '', array $reviewMetadata = []): void
    {
        $date = now()->toDateString();
        if ($correlation === 'checked') {
            return;
        }
        $old = RouteStop::with('route')->where('shipment_id', $shipment->id)->whereHas('route', fn ($q) => $q->whereIn('status', ['planned', 'active']))->get();
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
        if (! RouteStop::where('route_id', $route->id)->where('shipment_id', $shipment->id)->exists()) {
            RouteStop::create(['route_id' => $route->id, 'shipment_id' => $shipment->id, 'sort_order' => (int) ($route->stops()->max('sort_order') ?? 0) + 1, 'status' => 'pending']);
        }
        $route->syncStopsCounts();
        $reviewType = $correlation === 'transferred' ? 'custody_transferred' : 'auto_assigned_by_scan';
        $notificationType = $correlation === 'transferred' ? 'custody_transfer' : 'qr_auto_assignment';
        CustodyReview::create(['shipment_id' => $shipment->id, 'type' => $reviewType, 'previous_driver_id' => $previousDriver, 'new_driver_id' => $driverId, 'custody_event_id' => $custody->id, 'status' => 'pending', 'occurred_at' => $custody->occurred_at, 'metadata' => ['correlation' => $correlation] + $reviewMetadata]);

        $code = $this->packageLabel($shipment);
        $newName = $this->guard->driverName($driverId);
        if ($correlation === 'transferred') {
            $previousName = $this->guard->driverName($previousDriver);
            Notification::sendToAdmins($notificationType, 'Cambio de piloto', "Paquete {$code} pasó de {$previousName} a {$newName}".$notificationSuffix, '/revisiones');
        } else {
            Notification::sendToAdmins($notificationType, 'Asignado por escaneo', "Paquete {$code} quedó a cargo de {$newName} al escanearlo", '/revisiones');
        }
    }

    private function packageLabel(Shipment $shipment): string
    {
        $code = trim((string) ($shipment->display_code ?: $shipment->tracking_code));

        return str_starts_with($code, '#') ? $code : '#'.$code;
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
        $payload['lat'] = isset($payload['lat']) ? (float) $payload['lat'] : null;
        $payload['lng'] = isset($payload['lng']) ? (float) $payload['lng'] : null;
        $payload['packages'] = array_map(static fn (array $package): array => [
            'scan_code' => trim($package['scan_code']),
            'physical_condition' => $package['physical_condition'] ?? null,
        ], $payload['packages']);

        return $payload;
    }
}
