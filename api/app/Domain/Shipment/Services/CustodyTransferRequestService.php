<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Driver\Models\Driver;
use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\CustodyTransferRequest;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Respuestas a las solicitudes de traspaso entre pilotos (contrato
 * 2026-09-26-B §1): A acepta o rechaza; administración aprueba o rechaza
 * cuando A no puede responder.
 *
 * Aceptar y aprobar son idempotentes y seguros ante carreras: se bloquean el
 * envío y la solicitud, y se vuelve a comprobar que el paquete siga con A.
 */
class CustodyTransferRequestService
{
    public function __construct(
        private readonly DriverReceptionService $reception,
        private readonly CustodyGuard $guard,
    ) {}

    /** @return array{incoming:list<array<string,mixed>>,outgoing:list<array<string,mixed>>} */
    public function forDriver(int $driverId): array
    {
        CustodyTransferRequest::expireOverdue();

        $incoming = $this->withRelations(CustodyTransferRequest::query()
            ->where('from_driver_id', $driverId)
            ->where('status', CustodyTransferRequest::PENDING)
            ->oldest('requested_at'))->get();

        $outgoing = $this->withRelations(CustodyTransferRequest::query()
            ->where('to_driver_id', $driverId)
            ->where('requested_at', '>=', now()->subDay())
            ->latest('requested_at')
            ->latest('id'))->get();

        return [
            'incoming' => $this->presentMany($incoming),
            'outgoing' => $this->presentMany($outgoing),
        ];
    }

    /** @return list<array<string,mixed>> */
    public function forAdmin(?string $status): array
    {
        CustodyTransferRequest::expireOverdue();

        $query = $this->withRelations(CustodyTransferRequest::query()->latest('requested_at')->latest('id'));
        if ($status !== null && $status !== '') {
            $query->where('status', $status);
        } else {
            $query->where('requested_at', '>=', now()->subDays(7));
        }

        return $this->presentMany($query->limit(200)->get());
    }

    /**
     * A acepta (o administración aprueba): ejecuta el traspaso.
     *
     * @return array{0:int,1:array<string,mixed>} [http status, body]
     */
    public function accept(int $requestId, User $actor, ?int $actingDriverId): array
    {
        $byAdmin = $actingDriverId === null;

        return DB::transaction(function () use ($requestId, $actor, $actingDriverId, $byAdmin): array {
            $peek = CustodyTransferRequest::query()->findOrFail($requestId);
            $this->assertOwner($peek, $actingDriverId);

            // Orden de bloqueo: envío → solicitud (igual que el escaneo).
            $shipment = Shipment::query()->lockForUpdate()->find($peek->shipment_id);
            $request = CustodyTransferRequest::query()->lockForUpdate()->findOrFail($requestId);

            if ($request->isExecuted()) {
                return [200, $this->body($request, 'El paquete ya había pasado a '.$this->name($request->to_driver_id).'.')];
            }
            if ($request->isOverdue()) {
                $request->update(['status' => CustodyTransferRequest::EXPIRED, 'responded_at' => $request->expires_at]);

                return [409, $this->body($request, 'La solicitud venció. El otro piloto debe volver a escanear el paquete.')];
            }
            if (! $request->isPending()) {
                return [409, $this->body($request, $this->closedMessage($request))];
            }

            $latest = $shipment ? $this->guard->latest($shipment) : null;
            $holder = $shipment ? $this->guard->holdingDriver($shipment, $latest) : null;
            $eligible = [ShipmentStatus::PICKED_UP, ShipmentStatus::IN_WAREHOUSE, ShipmentStatus::ASSIGNED_TO_ROUTE,
                ShipmentStatus::HANDED_TO_DRIVER, ShipmentStatus::IN_TRANSIT];
            if ($shipment === null || $latest === null || $holder === null
                || $holder['id'] !== (int) $request->from_driver_id
                || ! in_array($shipment->status, $eligible, true)) {
                $request->update(['status' => CustodyTransferRequest::CANCELLED, 'responded_at' => now(),
                    'responded_by_user_id' => $actor->id]);
                $this->notifyRequester($request, 'Solicitud cancelada',
                    'El paquete '.$this->label($shipment).' ya no está con '.$this->name($request->from_driver_id).'. La solicitud se canceló.');

                return [409, $this->body($request, 'El paquete ya no está con '.$this->name($request->from_driver_id).' (entregado, devuelto u otro cambio). La solicitud se canceló.')];
            }

            $to = Driver::query()->findOrFail($request->to_driver_id);
            $requester = $request->requested_by_user_id ? User::query()->find($request->requested_by_user_id) : null;
            $fromName = $this->name($request->from_driver_id);
            $meta = is_array($request->metadata_json) ? $request->metadata_json : [];

            $custody = $this->reception->executeTransfer($shipment, $to, $requester ?? $actor, $latest, [
                'physical_condition' => $meta['physical_condition'] ?? null,
                'lat' => $meta['lat'] ?? null,
                'lng' => $meta['lng'] ?? null,
                'metadata' => [
                    'transfer_request_id' => (int) $request->id,
                    'accepted_via' => $byAdmin ? 'admin' : 'driver',
                    'accepted_by_user_id' => $actor->id,
                    'accepted_by_name' => $actor->name,
                    'scan_code' => $meta['scan_code'] ?? null,
                ],
                'notification_suffix' => $byAdmin ? ' (aprobado por administración)' : " ({$fromName} aceptó)",
                'review_metadata' => ['transfer_request_id' => (int) $request->id, 'accepted_via' => $byAdmin ? 'admin' : 'driver'],
            ]);

            $request->update([
                'status' => $byAdmin ? CustodyTransferRequest::APPROVED_BY_ADMIN : CustodyTransferRequest::ACCEPTED,
                'responded_by_user_id' => $actor->id,
                'responded_at' => now(),
                'custody_event_id' => $custody->id,
            ]);

            $this->notifyRequester($request, 'Ya es tuyo',
                'El paquete '.$this->label($shipment).' ya es tuyo'.($byAdmin ? ' (aprobado por administración).' : " ({$fromName} aceptó)."));

            return [200, $this->body($request, 'Listo. El paquete pasó a '.$this->name($request->to_driver_id).'.')];
        });
    }

    /** @return array{0:int,1:array<string,mixed>} */
    public function reject(int $requestId, User $actor, ?int $actingDriverId, ?string $reason): array
    {
        $reason = trim((string) $reason) ?: null;

        return DB::transaction(function () use ($requestId, $actor, $actingDriverId, $reason): array {
            $peek = CustodyTransferRequest::query()->findOrFail($requestId);
            $this->assertOwner($peek, $actingDriverId);

            Shipment::query()->lockForUpdate()->find($peek->shipment_id);
            $request = CustodyTransferRequest::query()->lockForUpdate()->findOrFail($requestId);

            if ($request->status === CustodyTransferRequest::REJECTED) {
                return [200, $this->body($request, 'La solicitud ya estaba rechazada.')];
            }
            if ($request->isOverdue()) {
                $request->update(['status' => CustodyTransferRequest::EXPIRED, 'responded_at' => $request->expires_at]);

                return [409, $this->body($request, 'La solicitud ya había vencido.')];
            }
            if (! $request->isPending()) {
                return [409, $this->body($request, $this->closedMessage($request))];
            }

            $byAdmin = $actingDriverId === null;
            $request->update([
                'status' => CustodyTransferRequest::REJECTED,
                'responded_by_user_id' => $actor->id,
                'responded_at' => now(),
                'reason' => $reason !== null ? mb_substr($reason, 0, 500) : null,
                'metadata_json' => array_merge($request->metadata_json ?? [], ['rejected_via' => $byAdmin ? 'admin' : 'driver']),
            ]);

            $shipment = Shipment::query()->find($request->shipment_id);
            $who = $byAdmin ? 'Administración' : $this->name($request->from_driver_id);
            $this->notifyRequester($request, 'No aceptado',
                "{$who} no aceptó darte el paquete ".$this->label($shipment).($reason ? ": {$reason}" : '.'));

            return [200, $this->body($request, 'Listo. El paquete sigue con '.$this->name($request->from_driver_id).'.')];
        });
    }

    /** @return array<string,mixed> */
    public function present(CustodyTransferRequest $request): array
    {
        $request->loadMissing(['shipment', 'fromDriver:id,name', 'toDriver:id,name']);
        $shipment = $request->shipment;

        return [
            'id' => (int) $request->id,
            'status' => $request->status,
            'expires_at' => $request->expires_at?->toIso8601String(),
            'requested_at' => $request->requested_at?->toIso8601String(),
            'responded_at' => $request->responded_at?->toIso8601String(),
            'reason' => $request->reason,
            'shipment' => $shipment ? [
                'id' => (int) $shipment->id,
                'display_code' => $shipment->display_code ?: $shipment->tracking_code,
                'recipient_name' => $shipment->recipient_name,
                'recipient_address' => $shipment->recipient_address,
            ] : null,
            'from_driver' => ['id' => (int) $request->from_driver_id, 'name' => $this->guard->driverName((int) $request->from_driver_id, $request->fromDriver?->name)],
            'to_driver' => ['id' => (int) $request->to_driver_id, 'name' => $this->guard->driverName((int) $request->to_driver_id, $request->toDriver?->name)],
        ];
    }

    private function assertOwner(CustodyTransferRequest $request, ?int $actingDriverId): void
    {
        if ($actingDriverId !== null && (int) $request->from_driver_id !== $actingDriverId) {
            abort(403, 'Solo el piloto que tiene el paquete puede responder esta solicitud.');
        }
    }

    private function closedMessage(CustodyTransferRequest $request): string
    {
        return match ($request->status) {
            CustodyTransferRequest::REJECTED => 'Esta solicitud ya fue rechazada.',
            CustodyTransferRequest::EXPIRED => 'La solicitud venció. El otro piloto debe volver a escanear el paquete.',
            CustodyTransferRequest::CANCELLED => 'La solicitud se canceló porque el paquete cambió.',
            default => 'Esta solicitud ya fue respondida.',
        };
    }

    /** @return array<string,mixed> */
    private function body(CustodyTransferRequest $request, string $message): array
    {
        return ['message' => $message, 'status' => $request->status, 'data' => $this->present($request->fresh() ?? $request)];
    }

    private function notifyRequester(CustodyTransferRequest $request, string $title, string $body): void
    {
        $userId = $request->requested_by_user_id ?: $this->reception->pilotUserId((int) $request->to_driver_id);
        if ($userId) {
            Notification::send((int) $userId, 'custody_transfer_response', $title, $body, null,
                ['transfer_request_id' => $request->id, 'status' => $request->status]);
        }
    }

    private function withRelations($query)
    {
        return $query->with(['shipment', 'fromDriver:id,name', 'toDriver:id,name']);
    }

    /** @return list<array<string,mixed>> */
    private function presentMany(Collection $requests): array
    {
        return $requests->map(fn (CustodyTransferRequest $r) => $this->present($r))->values()->all();
    }

    private function name(int|string|null $driverId): string
    {
        return $this->guard->driverName($driverId ? (int) $driverId : null);
    }

    private function label(?Shipment $shipment): string
    {
        if ($shipment === null) {
            return '';
        }
        $code = trim((string) ($shipment->display_code ?: $shipment->tracking_code));

        return str_starts_with($code, '#') ? $code : '#'.$code;
    }
}
