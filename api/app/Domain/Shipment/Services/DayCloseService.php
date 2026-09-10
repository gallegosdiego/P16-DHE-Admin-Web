<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shared\Models\IdempotencyRecord;
use App\Domain\Shipment\Actions\TransitionShipmentStatus;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DayCloseService
{
    public function __construct(private readonly CustodyRecorder $custody, private readonly TransitionShipmentStatus $transition) {}

    public function summary(string $date): array
    {
        $routes = Route::query()->whereDate('route_date', $date)->with(['driver', 'stops.shipment', 'taskStops'])->get();

        return ['date' => $date, 'drivers' => $routes->groupBy('driver_id')->map(function ($driverRoutes) use ($date) {
            $driver = $driverRoutes->first()->driver;
            $nextDate = date('Y-m-d', strtotime($date.' +1 day'));
            $shipments = Shipment::query()->where('driver_id', $driver?->id)->where(function ($query) use ($date, $nextDate) {
                $query->whereHas('routeStops.route', fn ($route) => $route->whereDate('route_date', $date))
                    ->orWhereHas('custodyEvents', fn ($event) => $event->where('new_custodian_type', 'driver')->where(function ($dates) use ($date, $nextDate) {
                        $dates->whereDate('occurred_at', $date)->orWhereDate('occurred_at', $nextDate);
                    }));
            })->get();
            // La custodia vigente manda aunque el evento cruce medianoche UTC:
            // tomamos solo el último evento de cada paquete.
            $custodyIds = CustodyEvent::query()
                ->whereIn('shipment_id', $shipments->pluck('id'))
                ->where('new_custodian_type', 'driver')
                ->whereNotExists(fn ($q) => $q->from('custody_events as newer')->whereColumn('newer.shipment_id', 'custody_events.shipment_id')->where(function ($inner) {
                    $inner->whereColumn('newer.occurred_at', '>', 'custody_events.occurred_at')->orWhere(function ($tie) {
                        $tie->whereColumn('newer.occurred_at', 'custody_events.occurred_at')->whereColumn('newer.id', '>', 'custody_events.id');
                    });
                }))
                ->pluck('shipment_id')->unique();
            // `received_at_hub` is initial intake. Only the two explicit return
            // events represent a parcel coming back from a pilot.
            $returned = CustodyEvent::query()->whereIn('shipment_id', $shipments->pluck('id'))->whereIn('event_type', ['warehouse_return', 'returned_by_driver'])->whereDate('occurred_at', $date)->distinct('shipment_id')->count('shipment_id');
            $open = $driverRoutes->whereIn('status', ['planned', 'active']);
            $inMoto = $shipments->filter(fn ($s) => $custodyIds->contains($s->id) && ! $s->status->isTerminal() && ! $this->returnedToday($s->id, $date))->count();
            $failed = $driverRoutes->flatMap->taskStops->where('status', 'failed')->values();
            $packages = $shipments->filter(fn ($s) => $custodyIds->contains($s->id) && ! $s->status->isTerminal() && ! $this->returnedToday($s->id, $date))->map(fn ($s) => ['id' => $s->id, 'display_code' => $s->display_code, 'status' => $s->status->value])->values();

            return ['driver_id' => $driver?->id, 'driver_name' => $driver?->name, 'packages' => $packages->all(), 'routes' => $driverRoutes->map(fn ($r) => ['id' => $r->id, 'status' => $r->status, 'completed_stops' => (int) $r->completed_stops, 'total_stops' => (int) $r->total_stops, 'failed_tasks' => $r->taskStops->where('status', 'failed')->map(fn ($t) => ['id' => $t->id, 'reason' => $t->notes])->values()])->values(), 'counts' => ['departed' => $shipments->count(), 'delivered' => $shipments->where('status', ShipmentStatus::DELIVERED)->count(), 'issues' => $shipments->where('status', ShipmentStatus::ISSUE)->count(), 'on_motorcycle' => $inMoto, 'returned_to_warehouse' => $returned], 'cod' => ['expected' => (int) $shipments->where('payment_type', 'cash_on_delivery')->sum('cod_amount'), 'registered' => (int) $shipments->where('payment_type', 'cash_on_delivery')->sum(fn ($s) => (int) ($s->cod_collected_amount ?? 0))], 'day_settled' => $open->isEmpty() && $inMoto === 0, 'pending_reason' => $failed->isNotEmpty() ? $failed->map(fn ($t) => $t->notes ?: 'Tarea fallida')->implode('; ') : null];
        })->values()->all()];
    }

    private function returnedToday(int $shipmentId, string $date): bool
    {
        return CustodyEvent::query()->where('shipment_id', $shipmentId)->whereIn('event_type', ['warehouse_return', 'returned_by_driver'])->whereDate('occurred_at', $date)->exists();
    }

    public function warehouseReturns(array $shipmentIds, User $actor, string $key): array
    {
        $hash = hash('sha256', json_encode(['shipment_ids' => array_values($shipmentIds)], JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($shipmentIds, $actor, $key, $hash) {
            $record = IdempotencyRecord::query()->where('scope', 'day-close')->where('idempotency_key', $key)->where('operation', 'warehouse_returns')->lockForUpdate()->first();
            if ($record) {
                if (! hash_equals($record->request_hash, $hash)) {
                    throw ValidationException::withMessages(['idempotency_key' => 'La llave ya fue usada con otro contenido.']);
                }

return $record->response_json ?? [];
            }
            $accepted = [];
            $rejected = [];
            foreach (array_values(array_unique($shipmentIds)) as $id) {
                try {
                    $accepted[] = $this->returnOne((int) $id, $actor);
                } catch (\Throwable $e) {
                    $rejected[] = ['shipment_id' => (int) $id, 'reason' => $e instanceof ValidationException ? collect($e->errors())->flatten()->first() : $e->getMessage()];
                }
            }
            $result = ['accepted' => $accepted, 'rejected' => $rejected];
            IdempotencyRecord::query()->create(['scope' => 'day-close', 'idempotency_key' => $key, 'operation' => 'warehouse_returns', 'request_hash' => $hash, 'status' => 'completed', 'response_json' => $result, 'completed_at' => now(), 'expires_at' => now()->addDays(7)]);

            return $result;
        });
    }

    private function returnOne(int $id, User $actor): array
    {
        return DB::transaction(function () use ($id, $actor) {
            $shipment = Shipment::query()->lockForUpdate()->with('driver')->findOrFail($id);
            if (! $shipment->driver_id) {
                throw ValidationException::withMessages(['shipment' => 'El paquete no tiene piloto.']);
            }
            if ($shipment->routeStops()->whereHas('route', fn ($q) => $q->whereIn('status', ['planned', 'active']))->exists()) {
                throw ValidationException::withMessages(['shipment' => 'La salida sigue abierta.']);
            }
            if ($shipment->status->isTerminal()) {
                throw ValidationException::withMessages(['shipment' => 'El paquete ya está en estado terminal.']);
            }
            $latest = CustodyEvent::query()->where('shipment_id', $id)->latest('occurred_at')->latest('id')->first();
            if ($latest?->new_custodian_type !== 'driver' || (int) $latest->new_custodian_id !== (int) $shipment->driver_id) {
                throw ValidationException::withMessages(['shipment' => 'El paquete no está bajo custodia del piloto.']);
            }
            $this->custody->record($shipment, ['event_type' => 'warehouse_return', 'new_custodian_type' => 'hub', 'new_custodian_name' => 'Sede Danhei', 'actor_user_id' => $actor->id, 'metadata_json' => ['note' => 'Conciliación de fin de día']]);
            $this->transition->execute($shipment, ShipmentStatus::IN_WAREHOUSE, $actor, 'Conciliación de fin de día');

            return ['shipment_id' => $id, 'display_code' => $shipment->display_code, 'status' => ShipmentStatus::IN_WAREHOUSE->value];
        });
    }
}
