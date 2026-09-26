<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\DriverCodObligation;
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
        $groups = $routes->groupBy('driver_id');
        // Una ruta vacía puede eliminarse al devolver el último paquete; la
        // devolución debe seguir visible en el cierre aunque ya no haya ruta.
        $eventDrivers = CustodyEvent::whereDate('occurred_at', $date)->where('new_custodian_type', 'driver')->pluck('new_custodian_id')
            ->merge(CustodyEvent::whereDate('occurred_at', $date)->where('previous_custodian_type', 'driver')->pluck('previous_custodian_id'))->filter()->unique();
        foreach ($eventDrivers as $driverId) {
            if (! $groups->has($driverId)) {
                $groups->put($driverId, collect());
            }
        }
        $drivers = Driver::whereIn('id', $groups->keys())->get()->keyBy('id');
        // Saldos del libro de Conciliación: el efectivo que cada piloto debe
        // entregar (todas las fechas, igual que lo aplica una remesa) y los
        // pagos digitales que la oficina aún no ha verificado.
        $openObligations = DriverCodObligation::query()
            ->whereIn('driver_id', $groups->keys()->filter()->values())
            ->whereIn('status', ['pending', 'partial'])
            ->get(['id', 'driver_id', 'collected_amount', 'remitted_amount', 'payment_method', 'status'])
            ->groupBy('driver_id');

        return ['date' => $date, 'drivers' => $groups->map(function ($driverRoutes, $driverId) use ($date, $drivers, $openObligations) {
            $driver = $drivers->get($driverId);
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
                ->where('new_custodian_id', $driver?->id)
                ->whereNotExists(fn ($q) => $q->from('custody_events as newer')->whereColumn('newer.shipment_id', 'custody_events.shipment_id')->where(function ($inner) {
                    $inner->whereColumn('newer.occurred_at', '>', 'custody_events.occurred_at')->orWhere(function ($tie) {
                        $tie->whereColumn('newer.occurred_at', 'custody_events.occurred_at')->whereColumn('newer.id', '>', 'custody_events.id');
                    });
                }))
                ->pluck('shipment_id')->unique();
            // `received_at_hub` is initial intake. Only the two explicit return
            // events represent a parcel coming back from a pilot.
            $returned = CustodyEvent::query()->where('previous_custodian_type', 'driver')->where('previous_custodian_id', $driver?->id)->whereIn('event_type', ['warehouse_return', 'returned_by_driver'])->whereDate('occurred_at', $date)->distinct('shipment_id')->count('shipment_id');
            $open = $driverRoutes->whereIn('status', ['planned', 'active']);
            $inMoto = $shipments->filter(fn ($s) => $custodyIds->contains($s->id) && ! $s->status->isTerminal())->count();
            $failed = $driverRoutes->flatMap->taskStops->where('status', 'failed')->values();
            $packages = $shipments->filter(fn ($s) => $custodyIds->contains($s->id) && ! $s->status->isTerminal())->map(fn ($s) => ['id' => $s->id, 'display_code' => $s->display_code, 'status' => $s->status->value])->values();

            $driverObligations = $openObligations->get($driver?->id, collect());
            $cashOpen = $driverObligations->filter(fn (DriverCodObligation $row) => $row->channel === DriverCodObligation::CHANNEL_CASH);
            $digitalOpen = $driverObligations->filter(fn (DriverCodObligation $row) => $row->channel === DriverCodObligation::CHANNEL_DIGITAL);
            $ledger = [
                'cash_to_remit' => (int) $cashOpen->sum(fn (DriverCodObligation $row) => $row->outstanding()),
                'digital_pending' => (int) $digitalOpen->sum(fn (DriverCodObligation $row) => $row->outstanding()),
                'digital_pending_count' => $digitalOpen->count(),
            ];

            return ['driver_id' => $driver?->id, 'ledger' => $ledger, 'driver_name' => $driver?->name, 'packages' => $packages->all(), 'routes' => $driverRoutes->map(fn ($r) => ['id' => $r->id, 'status' => $r->status, 'completed_stops' => (int) $r->completed_stops, 'total_stops' => (int) $r->total_stops, 'failed_tasks' => $r->taskStops->where('status', 'failed')->map(fn ($t) => ['id' => $t->id, 'reason' => $t->notes])->values()])->values(), 'counts' => ['departed' => $shipments->count(), 'delivered' => $shipments->where('status', ShipmentStatus::DELIVERED)->count(), 'issues' => $shipments->where('status', ShipmentStatus::ISSUE)->count(), 'on_motorcycle' => $inMoto, 'returned_to_warehouse' => $returned], 'cod' => ['expected' => (int) $shipments->where('payment_type', 'cash_on_delivery')->sum('cod_amount'), 'registered' => (int) $shipments->where('payment_type', 'cash_on_delivery')->sum(fn ($s) => (int) ($s->cod_collected_amount ?? 0))], 'day_settled' => $open->isEmpty() && $inMoto === 0, 'pending_reason' => $failed->isNotEmpty() ? $failed->map(fn ($t) => $t->notes ?: 'Tarea fallida')->implode('; ') : null];
        })->values()->all()];
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
                } catch (ValidationException $e) {
                    // La llave del error es el código del motivo (ver returnOne).
                    $errors = $e->errors();
                    $rejected[] = ['id' => (int) $id, 'shipment_id' => (int) $id, 'reason' => (string) array_key_first($errors), 'message' => collect($errors)->flatten()->first()];
                } catch (\Throwable $e) {
                    report($e);
                    $rejected[] = ['id' => (int) $id, 'shipment_id' => (int) $id, 'reason' => 'processing_error', 'message' => 'No se pudo recibir este paquete en bodega. Intenta de nuevo.'];
                }
            }
            // `received` es el nombre del contrato 2026-09-26; `accepted` se
            // conserva para quien ya lo leía.
            $result = ['received' => $accepted, 'accepted' => $accepted, 'rejected' => $rejected];
            IdempotencyRecord::query()->create(['scope' => 'day-close', 'idempotency_key' => $key, 'operation' => 'warehouse_returns', 'request_hash' => $hash, 'status' => 'completed', 'response_json' => $result, 'completed_at' => now(), 'expires_at' => now()->addDays(7)]);

            return $result;
        });
    }

    private function returnOne(int $id, User $actor): array
    {
        return DB::transaction(function () use ($id, $actor) {
            $shipment = Shipment::query()->lockForUpdate()->with('driver')->findOrFail($id);
            // La llave de cada error es el código de motivo que ve el panel en
            // `rejected[].reason`; el texto va en `rejected[].message`.
            if (! $shipment->driver_id) {
                throw ValidationException::withMessages(['no_driver' => 'El paquete no tiene piloto.']);
            }
            // Solo una parada todavía pendiente bloquea: una novedad ya
            // resuelta en la salida sí vuelve a bodega (contrato 2026-09-26 §5).
            if ($shipment->routeStops()->where('status', 'pending')->whereHas('route', fn ($q) => $q->whereIn('status', ['planned', 'active']))->exists()) {
                throw ValidationException::withMessages(['route_open' => 'La salida sigue abierta.']);
            }
            if ($shipment->status->isTerminal()) {
                throw ValidationException::withMessages(['terminal' => 'El paquete ya está en estado terminal.']);
            }
            $latest = CustodyEvent::query()->where('shipment_id', $id)->latest('occurred_at')->latest('id')->first();
            if ($latest?->new_custodian_type !== 'driver' || (int) $latest->new_custodian_id !== (int) $shipment->driver_id) {
                throw ValidationException::withMessages(['not_driver_custody' => 'El paquete no está bajo custodia del piloto.']);
            }
            $this->custody->record($shipment, ['event_type' => 'warehouse_return', 'new_custodian_type' => 'hub', 'new_custodian_name' => 'Sede Danhei', 'actor_user_id' => $actor->id, 'metadata_json' => ['note' => 'Conciliación de fin de día']]);
            $this->transition->execute($shipment, ShipmentStatus::IN_WAREHOUSE, $actor, 'Conciliación de fin de día');
            // Vuelve a la sede: deja de ser de nadie. Sin esto el paquete sigue
            // contando como "salió" con ese piloto en las jornadas siguientes y
            // el escaneo lo lee como asignado.
            $shipment->forceFill(['driver_id' => null])->save();

            return ['shipment_id' => $id, 'display_code' => $shipment->display_code, 'status' => ShipmentStatus::IN_WAREHOUSE->value];
        });
    }
}
