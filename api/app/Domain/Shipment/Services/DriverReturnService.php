<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shared\Models\IdempotencyRecord;
use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Actions\TransitionShipmentStatus;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\CustodyReview;
use App\Domain\Shipment\Models\RouteStop;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class DriverReturnService
{
    public function __construct(private readonly RouteDispatchService $dispatch, private readonly TransitionShipmentStatus $transition, private readonly CustodyRecorder $custody) {}

    public function returns(User $actor, int $driverId, array $payload, string $key): array
    {
        $scope = "driver-return:$driverId";
        $hash = hash('sha256', json_encode($payload));
        $record = IdempotencyRecord::query()
            ->where('scope', $scope)
            ->where('idempotency_key', $key)
            ->where('operation', 'driver_return')
            ->first();
        if ($record?->status === 'completed') {
            return $record->response_json;
        }
        $accepted = [];
        $rejected = [];
        foreach ($payload['packages'] as $p) {
            try {
                $r = DB::transaction(fn () => $this->one($actor, $driverId, $p['scan_code'], $payload));
            } catch (\Throwable $e) {
                $r = ['accepted' => false, 'scan_code' => $p['scan_code'], 'reason_code' => 'processing_error', 'reason' => 'No se pudo registrar la devolución.'];
            } if ($r['accepted']) {
                $accepted[] = $r;
            } else {
                $rejected[] = $r;
            }
        }
        $response = ['accepted' => $accepted, 'rejected' => $rejected, 'summary' => ['accepted_count' => count($accepted), 'rejected_count' => count($rejected)]];
        IdempotencyRecord::updateOrCreate(['scope' => $scope, 'idempotency_key' => $key, 'operation' => 'driver_return'], ['request_hash' => $hash, 'status' => 'completed', 'response_json' => $response, 'completed_at' => now()]);

        return $response;
    }

    private function one(User $actor, int $driverId, string $code, array $p): array
    {
        $s = $this->dispatch->findShipmentByScanCode($code, true);
        if (! $s) {
            return ['accepted' => false, 'scan_code' => $code, 'reason_code' => 'not_found', 'reason' => 'Paquete no encontrado.'];
        }
        $latest = CustodyEvent::where('shipment_id', $s->id)->latest('occurred_at')->latest('id')->first();
        if ($s->status !== ShipmentStatus::HANDED_TO_DRIVER || $latest?->new_custodian_type !== 'driver' || (int) $latest->new_custodian_id !== $driverId) {
            return ['accepted' => false, 'scan_code' => $code, 'reason_code' => 'not_own_custody', 'reason' => 'El paquete no está bajo custodia del piloto autenticado.'];
        }
        $active = RouteStop::where('shipment_id', $s->id)->whereHas('route', fn ($q) => $q->where('status', 'active'))->exists();
        if ($active) {
            return ['accepted' => false, 'scan_code' => $code, 'reason_code' => 'active_route', 'reason' => 'El paquete pertenece a una ruta activa.'];
        }
        $s = $this->transition->execute($s, ShipmentStatus::IN_WAREHOUSE, $actor, 'Devolución del piloto a sede.', ['action' => 'driver_return', 'scan_code' => $code]);
        $event = $this->custody->record($s, ['event_type' => 'returned_by_driver', 'previous_custodian_type' => 'driver', 'previous_custodian_id' => $driverId, 'new_custodian_type' => 'hub', 'new_custodian_id' => null, 'actor_user_id' => $actor->id, 'lat' => $p['lat'], 'lng' => $p['lng'], 'occurred_at' => $p['occurred_at'], 'metadata_json' => ['device_id' => $p['device_id'], 'scan_code' => $code]]);
        // Vuelve a la sede: deja de ser de nadie (ver DayCloseService).
        $s->forceFill(['driver_id' => null])->save();
        RouteStop::where('shipment_id', $s->id)->whereHas('route', fn ($q) => $q->where('status', 'planned'))->get()->each(function ($stop) {
            $route = $stop->route;
            $stop->delete();
            $route->syncStopsCounts();
        });
        $review = CustodyReview::create(['shipment_id' => $s->id, 'type' => 'returned_by_driver', 'previous_driver_id' => $driverId, 'new_driver_id' => null, 'custody_event_id' => $event->id, 'status' => 'pending', 'occurred_at' => $event->occurred_at]);
        Notification::sendToRole('admin', 'warehouse_return', 'Devolución de piloto pendiente', 'Paquete devuelto a sede requiere revisión.', '/revisiones');

        return ['accepted' => true, 'scan_code' => $code, 'correlation' => 'returned_by_driver', 'package' => ['id' => $s->id, 'tracking_code' => $s->tracking_code, 'status' => $s->status->value], 'custody_event' => ['id' => $event->id, 'event_type' => $event->event_type]];
    }

    public function confirmHub(User $actor, string $code): array
    {
        return DB::transaction(function () use ($actor, $code) {
            $s = $this->dispatch->findShipmentByScanCode($code, true);
            if (! $s) {
                return ['confirmed' => false, 'reason_code' => 'not_found'];
            } $review = CustodyReview::where('shipment_id', $s->id)->where('type', 'returned_by_driver')->where('status', 'pending')->latest()->first();
            if (! $review) {
                return ['confirmed' => false, 'reason_code' => 'no_pending_return'];
            } $event = $this->custody->record($s, ['event_type' => 'return_confirmed_at_hub', 'previous_custodian_type' => 'hub', 'new_custodian_type' => 'hub', 'actor_user_id' => $actor->id, 'occurred_at' => now(), 'metadata_json' => ['review_id' => $review->id]]);
            $review->update(['status' => 'acknowledged', 'acknowledged_by_user_id' => $actor->id, 'acknowledged_at' => now()]);

            return ['confirmed' => true, 'shipment_id' => $s->id, 'custody_event_id' => $event->id, 'review_id' => $review->id];
        });
    }
}
