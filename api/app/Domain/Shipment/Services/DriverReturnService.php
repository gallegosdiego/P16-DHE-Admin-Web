<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Actions\TransitionShipmentStatus;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\CustodyReview;
use App\Domain\Shipment\Models\RouteStop;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class DriverReturnService
{
    /**
     * Lo que el piloto puede devolver a bodega estando en su moto. La novedad
     * (ISSUE) entra desde el contrato 2026-09-26 §5: antes quedaba atrapada y
     * el día nunca cerraba. EN RUTA entra si su parada ya no está pendiente en
     * una salida activa (la salida terminó o la parada ya se resolvió).
     */
    private const RETURNABLE_STATUSES = [
        ShipmentStatus::HANDED_TO_DRIVER,
        ShipmentStatus::ASSIGNED_TO_ROUTE,
        ShipmentStatus::ISSUE,
        ShipmentStatus::IN_TRANSIT,
    ];

    public function __construct(
        private readonly RouteDispatchService $dispatch,
        private readonly TransitionShipmentStatus $transition,
        private readonly CustodyRecorder $custody,
        private readonly CustodyBatch $batches,
    ) {}

    public function validateScan(int $driverId, string $code): array
    {
        $s = $this->dispatch->findShipmentByScanCode($code);
        $latest = $s ? CustodyEvent::where('shipment_id', $s->id)->latest('occurred_at')->latest('id')->first() : null;
        $reason = ! $s ? 'Paquete no encontrado.' : null;
        if ($s && (! in_array($s->status, self::RETURNABLE_STATUSES, true)
            || $latest?->new_custodian_type !== 'driver' || (int) $latest->new_custodian_id !== $driverId)) {
            $reason = 'El paquete no está bajo tu custodia disponible para devolución.';
        }
        if ($s && ! $reason && $this->pendingOnActiveRoute($s->id)) {
            $reason = 'Finaliza la salida activa antes de devolver el paquete a sede.';
        }

        return ['accepted' => $reason === null, 'scan_code' => $code, 'reason' => $reason,
            'package' => $s ? ['id' => $s->id, 'tracking_code' => $s->tracking_code, 'display_code' => $s->display_code,
                'recipient_name' => $s->recipient_name, 'recipient_zone' => $s->recipient_zone, 'status' => $s->status->value] : null];
    }

    public function returns(User $actor, int $driverId, array $payload, string $key): array
    {
        $scope = "driver-return:$driverId";

        return $this->batches->run($scope, $key, 'driver_return', $payload, function () use ($actor, $driverId, $payload, $scope, $key): array {
            $accepted = $rejected = [];
            foreach ($payload['packages'] as $package) {
                try {
                    $result = DB::transaction(fn () => $this->one($actor, $driverId, trim($package['scan_code']), $payload, $scope, $key));
                } catch (\Throwable $error) {
                    Log::error('driver_return.package_failed', ['driver_id' => $driverId, 'exception' => $error]);
                    $result = ['accepted' => false, 'scan_code' => $package['scan_code'], 'reason_code' => 'processing_error', 'reason' => 'No se pudo registrar la devolución.'];
                }
                if ($result['accepted']) {
                    $accepted[] = $result;
                } else {
                    $rejected[] = $result;
                }
            }

            return ['accepted' => $accepted, 'rejected' => $rejected,
                'summary' => ['accepted_count' => count($accepted), 'rejected_count' => count($rejected)]];
        });
    }

    private function one(User $actor, int $driverId, string $code, array $payload, string $scope, string $key): array
    {
        $s = $this->dispatch->findShipmentByScanCode($code, true);
        if (! $s) {
            return ['accepted' => false, 'scan_code' => $code, 'reason_code' => 'not_found', 'reason' => 'Paquete no encontrado.'];
        }
        $latest = CustodyEvent::where('shipment_id', $s->id)->latest('occurred_at')->latest('id')->first();
        if (! in_array($s->status, self::RETURNABLE_STATUSES, true)
            || $latest?->new_custodian_type !== 'driver' || (int) $latest->new_custodian_id !== $driverId) {
            return ['accepted' => false, 'scan_code' => $code, 'reason_code' => 'not_own_custody', 'reason' => 'El paquete no está bajo tu custodia disponible para devolución.'];
        }
        if ($this->pendingOnActiveRoute($s->id)) {
            return ['accepted' => false, 'scan_code' => $code, 'reason_code' => 'active_route', 'reason' => 'Finaliza la salida activa antes de devolver el paquete a sede.'];
        }
        $s = $this->transition->execute($s, ShipmentStatus::IN_WAREHOUSE, $actor, 'Devolución del piloto a sede.', ['action' => 'driver_return', 'scan_code' => $code]);
        $event = $this->custody->record($s, [
            'event_type' => 'returned_by_driver', 'previous_custodian_type' => 'driver', 'previous_custodian_id' => $driverId,
            'new_custodian_type' => 'hub', 'new_custodian_id' => null, 'actor_user_id' => $actor->id,
            'lat' => $payload['lat'] ?? null, 'lng' => $payload['lng'] ?? null, 'occurred_at' => now(),
            'metadata_json' => ['device_id' => $payload['device_id'], 'scan_code' => $code,
                'device_occurred_at' => $payload['occurred_at'], 'reason' => $payload['reason'] ?? null,
                'idempotency_scope' => $scope, 'idempotency_key' => $key],
        ]);
        $s->forceFill(['driver_id' => null])->save();
        RouteStop::with('route')->where('shipment_id', $s->id)->whereHas('route', fn ($q) => $q->where('status', 'planned'))->get()->each(function ($stop) {
            $route = $stop->route;
            $stop->delete();
            $route->syncStopsCounts();
        });
        CustodyReview::create(['shipment_id' => $s->id, 'type' => 'returned_by_driver', 'previous_driver_id' => $driverId,
            'custody_event_id' => $event->id, 'status' => 'pending', 'occurred_at' => $event->occurred_at,
            'metadata' => ['reason' => $payload['reason'] ?? null]]);
        Notification::sendToAdmins('warehouse_return', 'Devolución de piloto pendiente', 'Paquete devuelto a sede requiere revisión.', '/revisiones');

        return ['accepted' => true, 'scan_code' => $code, 'correlation' => 'returned_by_driver',
            'package' => ['id' => $s->id, 'display_code' => $s->display_code, 'tracking_code' => $s->tracking_code, 'status' => $s->status->value],
            'custody_event' => ['id' => $event->id, 'event_type' => $event->event_type]];
    }

    /**
     * Solo bloquea una parada todavía pendiente en una salida activa: una
     * novedad ya resuelta en esa salida sí puede volver a bodega.
     */
    private function pendingOnActiveRoute(int $shipmentId): bool
    {
        return RouteStop::where('shipment_id', $shipmentId)
            ->where('status', 'pending')
            ->whereHas('route', fn ($q) => $q->where('status', 'active'))
            ->exists();
    }

    public function confirmHub(User $actor, string $code): array
    {
        return DB::transaction(function () use ($actor, $code): array {
            $shipment = $this->dispatch->findShipmentByScanCode($code, true);
            if (! $shipment) {
                return ['confirmed' => false, 'reason_code' => 'not_found'];
            }
            $review = CustodyReview::where('shipment_id', $shipment->id)->where('type', 'returned_by_driver')
                ->where('status', 'pending')->latest('id')->lockForUpdate()->first();
            if (! $review) {
                return ['confirmed' => false, 'reason_code' => 'no_pending_return'];
            }
            $latest = CustodyEvent::where('shipment_id', $shipment->id)->latest('occurred_at')->latest('id')->first();
            if ((int) $latest?->id !== (int) $review->custody_event_id || $latest?->new_custodian_type !== 'hub') {
                return ['confirmed' => false, 'reason_code' => 'custody_changed'];
            }
            $event = $this->custody->record($shipment, ['event_type' => 'return_confirmed_at_hub',
                'previous_custodian_type' => 'hub', 'previous_custodian_id' => $latest->new_custodian_id,
                'new_custodian_type' => 'hub', 'actor_user_id' => $actor->id, 'occurred_at' => now(),
                'metadata_json' => ['review_id' => $review->id]]);
            $review->update(['status' => 'acknowledged', 'acknowledged_by_user_id' => $actor->id, 'acknowledged_at' => now()]);

            return ['confirmed' => true, 'shipment_id' => $shipment->id, 'custody_event_id' => $event->id, 'review_id' => $review->id];
        });
    }
}
