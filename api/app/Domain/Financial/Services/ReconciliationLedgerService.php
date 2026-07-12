<?php

namespace App\Domain\Financial\Services;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\ClientCodEntitlement;
use App\Domain\Financial\Models\ClientCodPayout;
use App\Domain\Financial\Models\ClientCodPayoutAllocation;
use App\Domain\Financial\Models\DriverCodObligation;
use App\Domain\Financial\Models\DriverCodRemittance;
use App\Domain\Financial\Models\DriverCodRemittanceAllocation;
use App\Domain\Financial\Models\DriverServiceEarning;
use App\Domain\Financial\Models\DriverServicePayment;
use App\Domain\Financial\Models\DriverServicePaymentAllocation;
use App\Domain\Financial\Models\PaymentIntent;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Libros independientes: COD que el piloto debe entregar, servicios que Danhei
 * debe pagar y COD disponible para el cliente. Nunca compensa cuentas por sí solo.
 */
class ReconciliationLedgerService
{
    public function recordDeliveredShipment(Shipment $shipment): void
    {
        $shipment->refresh();
        $driverId = (int) ($shipment->driver_id ?? 0);
        if ($driverId < 1) {
            return;
        }

        if ((int) $shipment->driver_fee > 0) {
            DriverServiceEarning::firstOrCreate(
                ['driver_id' => $driverId, 'shipment_id' => $shipment->id, 'service_type' => 'delivery'],
                ['earned_date' => ($shipment->delivered_at ?? now())->toDateString(), 'amount' => (int) $shipment->driver_fee, 'paid_amount' => 0, 'status' => 'pending']
            );
        }

        if ($shipment->payment_type->value !== 'cash_on_delivery') {
            return;
        }

        $amount = (int) ($shipment->cod_collected_amount ?? $shipment->cod_amount ?? 0);
        if ($amount < 1) {
            return;
        }

        $isVerifiedDigital = PaymentIntent::query()
            ->where('shipment_id', $shipment->id)
            ->where('status', 'verified')
            ->exists();

        if ($isVerifiedDigital) {
            $this->makeClientCodAvailable($shipment, null, $amount);
            $shipment->update(['financial_status' => 'settled']);
            return;
        }

        $obligation = DriverCodObligation::firstOrCreate(
            ['driver_id' => $driverId, 'shipment_id' => $shipment->id],
            [
                'client_id' => $shipment->client_id,
                'collection_date' => ($shipment->delivered_at ?? now())->toDateString(),
                'expected_amount' => (int) $shipment->cod_amount,
                'collected_amount' => $amount,
                'payment_method' => $shipment->cod_payment_method,
                'status' => 'pending',
                'reported_at' => $shipment->cod_collected_at ?? now(),
            ]
        );

        if ($obligation->wasRecentlyCreated) {
            ClientCodEntitlement::firstOrCreate(
                ['shipment_id' => $shipment->id],
                ['client_id' => $shipment->client_id, 'driver_cod_obligation_id' => $obligation->id, 'reported_amount' => $amount, 'status' => 'reported']
            );
        }
    }

    public function recordCodRemittance(Driver $driver, int $amount, User $actor, array $attributes = [], array $requestedAllocations = []): DriverCodRemittance
    {
        return DB::transaction(function () use ($driver, $amount, $actor, $attributes, $requestedAllocations) {
            $remittance = DriverCodRemittance::create([
                'reference' => 'REM-'.now()->format('Ymd').'-'.Str::upper(Str::random(8)),
                'driver_id' => $driver->id,
                'received_by' => $actor->id,
                'amount' => $amount,
                'method' => $attributes['method'] ?? 'cash',
                'external_reference' => $attributes['external_reference'] ?? null,
                'received_at' => $attributes['received_at'] ?? now(),
                'notes' => $attributes['notes'] ?? null,
            ]);

            $allocations = $this->resolveAllocations(
                DriverCodObligation::query()->where('driver_id', $driver->id)->whereIn('status', ['pending', 'partial'])->orderBy('collection_date')->orderBy('id'),
                $amount,
                $requestedAllocations
            );

            $allocated = 0;
            foreach ($allocations as [$obligation, $allocatedAmount]) {
                DriverCodRemittanceAllocation::create(['remittance_id' => $remittance->id, 'obligation_id' => $obligation->id, 'amount' => $allocatedAmount]);
                $newAmount = (int) $obligation->remitted_amount + $allocatedAmount;
                $completed = $newAmount >= (int) $obligation->collected_amount;
                $obligation->update(['remitted_amount' => $newAmount, 'status' => $completed ? 'remitted' : 'partial', 'fully_remitted_at' => $completed ? now() : null]);
                $this->makeClientCodAvailable($obligation->shipment, $obligation, $allocatedAmount);
                if ($completed) {
                    $obligation->shipment->update(['financial_status' => 'settled']);
                }
                $allocated += $allocatedAmount;
            }
            $remittance->update(['allocated_amount' => $allocated]);
            return $remittance->fresh('allocations.obligation.shipment');
        });
    }

    public function recordServicePayment(Driver $driver, int $amount, User $actor, array $attributes = [], array $requestedAllocations = []): DriverServicePayment
    {
        return DB::transaction(function () use ($driver, $amount, $actor, $attributes, $requestedAllocations) {
            $payment = DriverServicePayment::create([
                'reference' => 'PIL-'.now()->format('Ymd').'-'.Str::upper(Str::random(8)), 'driver_id' => $driver->id, 'paid_by' => $actor->id,
                'amount' => $amount, 'method' => $attributes['method'] ?? 'cash', 'external_reference' => $attributes['external_reference'] ?? null,
                'paid_at' => $attributes['paid_at'] ?? now(), 'notes' => $attributes['notes'] ?? null,
            ]);
            $allocations = $this->resolveAllocations(DriverServiceEarning::query()->where('driver_id', $driver->id)->whereIn('status', ['pending', 'partial'])->orderBy('earned_date')->orderBy('id'), $amount, $requestedAllocations);
            $allocated = 0;
            foreach ($allocations as [$earning, $allocatedAmount]) {
                DriverServicePaymentAllocation::create(['payment_id' => $payment->id, 'earning_id' => $earning->id, 'amount' => $allocatedAmount]);
                $newAmount = (int) $earning->paid_amount + $allocatedAmount;
                $completed = $newAmount >= (int) $earning->amount;
                $earning->update(['paid_amount' => $newAmount, 'status' => $completed ? 'paid' : 'partial', 'fully_paid_at' => $completed ? now() : null]);
                $allocated += $allocatedAmount;
            }
            $payment->update(['allocated_amount' => $allocated]);
            return $payment->fresh('allocations.earning.shipment');
        });
    }

    public function recordClientPayout(Client $client, int $amount, User $actor, array $attributes = [], array $requestedAllocations = []): ClientCodPayout
    {
        return DB::transaction(function () use ($client, $amount, $actor, $attributes, $requestedAllocations) {
            $payout = ClientCodPayout::create([
                'reference' => 'CLI-'.now()->format('Ymd').'-'.Str::upper(Str::random(8)), 'client_id' => $client->id, 'paid_by' => $actor->id,
                'amount' => $amount, 'method' => $attributes['method'] ?? 'bank_transfer', 'external_reference' => $attributes['external_reference'] ?? null,
                'paid_at' => $attributes['paid_at'] ?? now(), 'notes' => $attributes['notes'] ?? null,
            ]);
            $allocations = $this->resolveAllocations(ClientCodEntitlement::query()->where('client_id', $client->id)->whereIn('status', ['available', 'partial'])->orderBy('available_at')->orderBy('id'), $amount, $requestedAllocations);
            $allocated = 0;
            foreach ($allocations as [$entitlement, $allocatedAmount]) {
                ClientCodPayoutAllocation::create(['payout_id' => $payout->id, 'entitlement_id' => $entitlement->id, 'amount' => $allocatedAmount]);
                $newAmount = (int) $entitlement->transferred_amount + $allocatedAmount;
                $completed = $newAmount >= (int) $entitlement->available_amount;
                $entitlement->update(['transferred_amount' => $newAmount, 'status' => $completed ? 'transferred' : 'partial', 'fully_transferred_at' => $completed ? now() : null]);
                $allocated += $allocatedAmount;
            }
            $payout->update(['allocated_amount' => $allocated]);
            return $payout->fresh('allocations.entitlement.shipment');
        });
    }

    public function makeClientCodAvailable(Shipment $shipment, ?DriverCodObligation $obligation, int $amount): void
    {
        $entitlement = ClientCodEntitlement::firstOrCreate(
            ['shipment_id' => $shipment->id],
            ['client_id' => $shipment->client_id, 'driver_cod_obligation_id' => $obligation?->id, 'reported_amount' => $amount, 'status' => 'reported']
        );
        $available = min((int) $entitlement->reported_amount, (int) $entitlement->available_amount + $amount);
        $entitlement->update(['available_amount' => $available, 'status' => $entitlement->transferred_amount >= $available ? 'transferred' : 'available', 'available_at' => $entitlement->available_at ?? now()]);
    }

    /** @return array<int, array{0: object, 1: int}> */
    private function resolveAllocations($query, int $amount, array $requestedAllocations): array
    {
        $rows = $query->lockForUpdate()->get()->keyBy('id');
        $candidates = [];
        if ($requestedAllocations) {
            foreach ($requestedAllocations as $request) {
                $row = $rows->get((int) $request['id']);
                $value = (int) $request['amount'];
                if (! $row || $value < 1 || $value > $this->outstanding($row)) throw new \InvalidArgumentException('La asignación no corresponde a un saldo pendiente.');
                $candidates[] = [$row, $value];
            }
        } else {
            $remaining = $amount;
            foreach ($rows as $row) {
                if ($remaining < 1) break;
                $value = min($remaining, $this->outstanding($row));
                if ($value > 0) { $candidates[] = [$row, $value]; $remaining -= $value; }
            }
        }
        if (array_sum(array_map(fn ($entry) => $entry[1], $candidates)) > $amount) throw new \InvalidArgumentException('Las asignaciones superan el valor del pago.');
        return $candidates;
    }

    private function outstanding(object $row): int
    {
        return $row instanceof DriverCodObligation ? $row->outstanding() : ($row instanceof DriverServiceEarning ? $row->outstanding() : $row->outstanding());
    }
}
