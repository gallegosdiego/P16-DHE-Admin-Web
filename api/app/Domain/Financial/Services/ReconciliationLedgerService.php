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
use App\Domain\Financial\Models\FinancialOpeningEntry;
use App\Domain\Financial\Models\PaymentIntent;
use App\Domain\Operations\Enums\OperationalTaskType;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Libros independientes: COD que el piloto debe entregar, servicios que Danhei
 * debe pagar y COD disponible para el cliente. Nunca compensa cuentas por sí solo.
 */
class ReconciliationLedgerService
{
    public function __construct(
        private readonly FinancialRateResolver $rateResolver,
    ) {}

    public function recordDeliveredShipment(Shipment $shipment): void
    {
        $shipment->refresh()->loadMissing(['driver', 'client']);
        $driverId = (int) ($shipment->driver_id ?? 0);
        if ($driverId < 1) {
            return;
        }

        $fallbackAmount = (int) $shipment->driver_fee;
        if ($fallbackAmount < 1) {
            $fallbackAmount = (int) ($shipment->driver?->per_package_rate ?? 0);
        }
        $earnedDate = $shipment->delivered_at ?? now();
        $resolvedRate = $this->rateResolver->resolve(
            'delivery',
            $earnedDate,
            $shipment->driver,
            $shipment->client,
            $shipment->recipient_zone,
            $fallbackAmount,
        );

        if ($resolvedRate['amount'] > 0) {
            DriverServiceEarning::firstOrCreate(
                ['driver_id' => $driverId, 'shipment_id' => $shipment->id, 'service_type' => 'delivery'],
                [
                    'rate_rule_id' => $resolvedRate['rule']?->id,
                    'earned_date' => $earnedDate->toDateString(),
                    'amount' => $resolvedRate['amount'],
                    'standard_amount' => $resolvedRate['amount'],
                    'rate_snapshot_json' => $resolvedRate['snapshot'],
                    'paid_amount' => 0,
                    'status' => 'pending',
                ]
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

    public function recordCompletedOperationalTask(OperationalTask $task): void
    {
        $task->refresh()->loadMissing([
            'assignedDriver',
            'customer',
            'pickupRequest',
            'shipment.client',
            'serviceLocation',
        ]);
        if ($task->assigned_driver_id === null) {
            return;
        }

        $serviceType = match ($task->task_type) {
            OperationalTaskType::CLIENT_PICKUP => 'pickup',
            OperationalTaskType::RETURN_TO_HUB => 'return_to_hub',
            OperationalTaskType::RETURN_TO_CLIENT => 'return_to_client',
            default => null,
        };
        if ($serviceType === null) {
            return;
        }

        $client = $task->customer ?? $task->shipment?->client;
        $zoneName = $task->pickupRequest?->pickup_zone
            ?? $task->shipment?->recipient_zone
            ?? $task->serviceLocation?->zone;
        $earnedDate = $task->completed_at ?? now();
        $resolvedRate = $this->rateResolver->resolve(
            $serviceType,
            $earnedDate,
            $task->assignedDriver,
            $client,
            $zoneName,
        );
        if ($resolvedRate['amount'] < 1) {
            return;
        }

        DriverServiceEarning::firstOrCreate(
            [
                'driver_id' => $task->assigned_driver_id,
                'operational_task_id' => $task->id,
                'service_type' => $serviceType,
            ],
            [
                'shipment_id' => $task->shipment_id,
                'rate_rule_id' => $resolvedRate['rule']?->id,
                'earned_date' => $earnedDate->toDateString(),
                'amount' => $resolvedRate['amount'],
                'standard_amount' => $resolvedRate['amount'],
                'rate_snapshot_json' => $resolvedRate['snapshot'],
                'paid_amount' => 0,
                'status' => 'pending',
            ],
        );
    }

    public function recordCodRemittance(Driver $driver, int $amount, User $actor, array $attributes = [], array $requestedAllocations = []): DriverCodRemittance
    {
        return DB::transaction(function () use ($driver, $amount, $actor, $attributes, $requestedAllocations) {
            $balanceBefore = $this->lockedPendingBalance(
                DriverCodObligation::query()
                    ->where('driver_id', $driver->id)
                    ->whereIn('status', ['pending', 'partial'])
                    ->orderBy('collection_date')
                    ->orderBy('id'),
            );
            $allocations = $this->resolveAllocations(
                DriverCodObligation::query()->where('driver_id', $driver->id)->whereIn('status', ['pending', 'partial'])->orderBy('collection_date')->orderBy('id'),
                $amount,
                $requestedAllocations
            );
            $remittance = DriverCodRemittance::create([
                'reference' => 'REM-'.now()->format('Ymd').'-'.Str::upper(Str::random(8)),
                'driver_id' => $driver->id,
                'received_by' => $actor->id,
                'approved_by' => $actor->id,
                'amount' => $amount,
                'allocated_amount' => $amount,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceBefore - $amount,
                'movement_type' => 'standard',
                'method' => $attributes['method'] ?? 'cash',
                'external_reference' => $attributes['external_reference'] ?? null,
                'status' => 'received',
                'received_at' => $attributes['received_at'] ?? now(),
                'approved_at' => now(),
                'notes' => $attributes['notes'] ?? null,
            ]);

            $allocated = 0;
            foreach ($allocations as [$obligation, $allocatedAmount]) {
                DriverCodRemittanceAllocation::create(['remittance_id' => $remittance->id, 'obligation_id' => $obligation->id, 'amount' => $allocatedAmount]);
                $newAmount = (int) $obligation->remitted_amount + $allocatedAmount;
                $completed = $newAmount >= (int) $obligation->collected_amount;
                $obligation->update(['remitted_amount' => $newAmount, 'status' => $completed ? 'remitted' : 'partial', 'fully_remitted_at' => $completed ? now() : null]);
                if ($obligation->shipment !== null) {
                    $this->makeClientCodAvailable($obligation->shipment, $obligation, $allocatedAmount);
                }
                if ($completed && $obligation->shipment !== null) {
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
            $balanceBefore = $this->lockedPendingBalance(
                DriverServiceEarning::query()
                    ->where('driver_id', $driver->id)
                    ->whereIn('status', ['pending', 'partial'])
                    ->orderBy('earned_date')
                    ->orderBy('id'),
            );
            $allocations = $this->resolveAllocations(
                DriverServiceEarning::query()->where('driver_id', $driver->id)->whereIn('status', ['pending', 'partial'])->orderBy('earned_date')->orderBy('id'),
                $amount,
                $requestedAllocations
            );
            $payment = DriverServicePayment::create([
                'reference' => 'PIL-'.now()->format('Ymd').'-'.Str::upper(Str::random(8)),
                'driver_id' => $driver->id,
                'paid_by' => $actor->id,
                'approved_by' => $actor->id,
                'amount' => $amount,
                'allocated_amount' => $amount,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceBefore - $amount,
                'movement_type' => 'standard',
                'status' => 'posted',
                'method' => $attributes['method'] ?? 'cash',
                'external_reference' => $attributes['external_reference'] ?? null,
                'paid_at' => $attributes['paid_at'] ?? now(),
                'approved_at' => now(),
                'notes' => $attributes['notes'] ?? null,
            ]);
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
            $balanceBefore = $this->lockedPendingBalance(
                ClientCodEntitlement::query()
                    ->where('client_id', $client->id)
                    ->whereIn('status', ['available', 'partial'])
                    ->orderBy('available_at')
                    ->orderBy('id'),
            );
            $allocations = $this->resolveAllocations(
                ClientCodEntitlement::query()->where('client_id', $client->id)->whereIn('status', ['available', 'partial'])->orderBy('available_at')->orderBy('id'),
                $amount,
                $requestedAllocations
            );
            $payout = ClientCodPayout::create([
                'reference' => 'CLI-'.now()->format('Ymd').'-'.Str::upper(Str::random(8)),
                'client_id' => $client->id,
                'paid_by' => $actor->id,
                'approved_by' => $actor->id,
                'amount' => $amount,
                'allocated_amount' => $amount,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceBefore - $amount,
                'movement_type' => 'standard',
                'status' => 'posted',
                'method' => $attributes['method'] ?? 'bank_transfer',
                'external_reference' => $attributes['external_reference'] ?? null,
                'paid_at' => $attributes['paid_at'] ?? now(),
                'approved_at' => now(),
                'notes' => $attributes['notes'] ?? null,
            ]);
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

    public function reverseCodRemittance(DriverCodRemittance $remittance, User $actor, string $reason): DriverCodRemittance
    {
        return DB::transaction(function () use ($remittance, $actor, $reason) {
            $original = DriverCodRemittance::query()->lockForUpdate()->findOrFail($remittance->id);
            $this->assertReversible($original->movement_type, $original->status, DriverCodRemittance::query()->where('reversal_of_id', $original->id)->exists());
            $before = $original->toArray();
            $balanceBefore = $this->lockedPendingBalance(
                DriverCodObligation::query()
                    ->where('driver_id', $original->driver_id)
                    ->whereIn('status', ['pending', 'partial'])
                    ->orderBy('collection_date')
                    ->orderBy('id'),
            );
            $originalAllocations = DriverCodRemittanceAllocation::query()
                ->where('remittance_id', $original->id)
                ->orderBy('id')
                ->get();

            foreach ($originalAllocations as $allocation) {
                $obligation = DriverCodObligation::query()->lockForUpdate()->findOrFail($allocation->obligation_id);
                $newRemitted = (int) $obligation->remitted_amount - (int) $allocation->amount;
                if ($newRemitted < 0) {
                    throw new \InvalidArgumentException('La remesa no puede reversarse porque su aplicación ya no es consistente.');
                }

                $entitlement = ClientCodEntitlement::query()
                    ->where('driver_cod_obligation_id', $obligation->id)
                    ->lockForUpdate()
                    ->first();
                if ($entitlement !== null) {
                    $newAvailable = (int) $entitlement->available_amount - (int) $allocation->amount;
                    if ($newAvailable < (int) $entitlement->transferred_amount) {
                        throw new \InvalidArgumentException('No se puede reversar la remesa porque el cliente ya recibió fondos asociados.');
                    }
                    $entitlement->update([
                        'available_amount' => max(0, $newAvailable),
                        'status' => $this->entitlementStatus(max(0, $newAvailable), (int) $entitlement->transferred_amount),
                        'available_at' => $newAvailable > 0 ? $entitlement->available_at : null,
                        'fully_transferred_at' => $newAvailable > 0 && (int) $entitlement->transferred_amount >= $newAvailable
                            ? $entitlement->fully_transferred_at
                            : null,
                    ]);
                }

                $obligation->update([
                    'remitted_amount' => $newRemitted,
                    'status' => $newRemitted > 0 ? 'partial' : 'pending',
                    'fully_remitted_at' => null,
                ]);
                $obligation->shipment?->update(['financial_status' => 'collected']);
            }

            $reversal = DriverCodRemittance::query()->create([
                'reference' => $this->movementReference('REV-REM'),
                'driver_id' => $original->driver_id,
                'received_by' => $actor->id,
                'approved_by' => $actor->id,
                'amount' => $original->amount,
                'allocated_amount' => $original->allocated_amount,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceBefore + (int) $original->allocated_amount,
                'movement_type' => 'reversal',
                'reversal_of_id' => $original->id,
                'method' => 'reversal',
                'external_reference' => $original->reference,
                'status' => 'posted',
                'received_at' => now(),
                'approved_at' => now(),
                'notes' => $reason,
            ]);
            foreach ($originalAllocations as $allocation) {
                DriverCodRemittanceAllocation::query()->create([
                    'remittance_id' => $reversal->id,
                    'obligation_id' => $allocation->obligation_id,
                    'amount' => $allocation->amount,
                ]);
            }
            $original->update(['status' => 'reversed']);

            AuditLog::log(
                'financial.driver_cod_remittance_reversed',
                $original,
                $before,
                array_merge($original->fresh()->toArray(), [
                    'reversal_id' => $reversal->id,
                    'reversal_reference' => $reversal->reference,
                ]),
                $reason,
            );

            return $reversal->fresh(['allocations.obligation.shipment', 'reversalOf:id,reference']);
        });
    }

    public function reverseServicePayment(DriverServicePayment $payment, User $actor, string $reason): DriverServicePayment
    {
        return DB::transaction(function () use ($payment, $actor, $reason) {
            $original = DriverServicePayment::query()->lockForUpdate()->findOrFail($payment->id);
            $this->assertReversible($original->movement_type, $original->status, DriverServicePayment::query()->where('reversal_of_id', $original->id)->exists());
            $before = $original->toArray();
            $balanceBefore = $this->lockedPendingBalance(
                DriverServiceEarning::query()
                    ->where('driver_id', $original->driver_id)
                    ->whereIn('status', ['pending', 'partial'])
                    ->orderBy('earned_date')
                    ->orderBy('id'),
            );
            $originalAllocations = DriverServicePaymentAllocation::query()
                ->where('payment_id', $original->id)
                ->orderBy('id')
                ->get();

            foreach ($originalAllocations as $allocation) {
                $earning = DriverServiceEarning::query()->lockForUpdate()->findOrFail($allocation->earning_id);
                $newPaid = (int) $earning->paid_amount - (int) $allocation->amount;
                if ($newPaid < 0) {
                    throw new \InvalidArgumentException('El pago no puede reversarse porque su aplicación ya no es consistente.');
                }
                $earning->update([
                    'paid_amount' => $newPaid,
                    'status' => $newPaid > 0 ? 'partial' : 'pending',
                    'fully_paid_at' => null,
                ]);
            }

            $reversal = DriverServicePayment::query()->create([
                'reference' => $this->movementReference('REV-PIL'),
                'driver_id' => $original->driver_id,
                'paid_by' => $actor->id,
                'approved_by' => $actor->id,
                'amount' => $original->amount,
                'allocated_amount' => $original->allocated_amount,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceBefore + (int) $original->allocated_amount,
                'movement_type' => 'reversal',
                'status' => 'posted',
                'reversal_of_id' => $original->id,
                'method' => 'reversal',
                'external_reference' => $original->reference,
                'paid_at' => now(),
                'approved_at' => now(),
                'notes' => $reason,
            ]);
            foreach ($originalAllocations as $allocation) {
                DriverServicePaymentAllocation::query()->create([
                    'payment_id' => $reversal->id,
                    'earning_id' => $allocation->earning_id,
                    'amount' => $allocation->amount,
                ]);
            }
            $original->update(['status' => 'reversed']);

            AuditLog::log(
                'financial.driver_service_payment_reversed',
                $original,
                $before,
                array_merge($original->fresh()->toArray(), [
                    'reversal_id' => $reversal->id,
                    'reversal_reference' => $reversal->reference,
                ]),
                $reason,
            );

            return $reversal->fresh(['allocations.earning.shipment', 'reversalOf:id,reference']);
        });
    }

    public function reverseClientPayout(ClientCodPayout $payout, User $actor, string $reason): ClientCodPayout
    {
        return DB::transaction(function () use ($payout, $actor, $reason) {
            $original = ClientCodPayout::query()->lockForUpdate()->findOrFail($payout->id);
            $this->assertReversible($original->movement_type, $original->status, ClientCodPayout::query()->where('reversal_of_id', $original->id)->exists());
            $before = $original->toArray();
            $balanceBefore = $this->lockedPendingBalance(
                ClientCodEntitlement::query()
                    ->where('client_id', $original->client_id)
                    ->whereIn('status', ['available', 'partial'])
                    ->orderBy('available_at')
                    ->orderBy('id'),
            );
            $originalAllocations = ClientCodPayoutAllocation::query()
                ->where('payout_id', $original->id)
                ->orderBy('id')
                ->get();

            foreach ($originalAllocations as $allocation) {
                $entitlement = ClientCodEntitlement::query()->lockForUpdate()->findOrFail($allocation->entitlement_id);
                $newTransferred = (int) $entitlement->transferred_amount - (int) $allocation->amount;
                if ($newTransferred < 0) {
                    throw new \InvalidArgumentException('La transferencia no puede reversarse porque su aplicación ya no es consistente.');
                }
                $entitlement->update([
                    'transferred_amount' => $newTransferred,
                    'status' => $this->entitlementStatus((int) $entitlement->available_amount, $newTransferred),
                    'fully_transferred_at' => $newTransferred >= (int) $entitlement->available_amount ? $entitlement->fully_transferred_at : null,
                ]);
            }

            $reversal = ClientCodPayout::query()->create([
                'reference' => $this->movementReference('REV-CLI'),
                'client_id' => $original->client_id,
                'paid_by' => $actor->id,
                'approved_by' => $actor->id,
                'amount' => $original->amount,
                'allocated_amount' => $original->allocated_amount,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceBefore + (int) $original->allocated_amount,
                'movement_type' => 'reversal',
                'status' => 'posted',
                'reversal_of_id' => $original->id,
                'method' => 'reversal',
                'external_reference' => $original->reference,
                'paid_at' => now(),
                'approved_at' => now(),
                'notes' => $reason,
            ]);
            foreach ($originalAllocations as $allocation) {
                ClientCodPayoutAllocation::query()->create([
                    'payout_id' => $reversal->id,
                    'entitlement_id' => $allocation->entitlement_id,
                    'amount' => $allocation->amount,
                ]);
            }
            $original->update(['status' => 'reversed']);

            AuditLog::log(
                'financial.client_cod_payout_reversed',
                $original,
                $before,
                array_merge($original->fresh()->toArray(), [
                    'reversal_id' => $reversal->id,
                    'reversal_reference' => $reversal->reference,
                ]),
                $reason,
            );

            return $reversal->fresh(['allocations.entitlement.shipment', 'reversalOf:id,reference']);
        });
    }

    /** @param array<string, mixed> $attributes */
    public function recordOpeningEntry(string $accountType, int $amount, User $actor, array $attributes): FinancialOpeningEntry
    {
        return DB::transaction(function () use ($accountType, $amount, $actor, $attributes) {
            $effectiveDate = CarbonImmutable::parse($attributes['effective_date']);
            $entry = FinancialOpeningEntry::query()->create([
                'reference' => $this->movementReference('OPEN'),
                'account_type' => $accountType,
                'driver_id' => $attributes['driver_id'] ?? null,
                'client_id' => $attributes['client_id'] ?? null,
                'amount' => $amount,
                'effective_date' => $effectiveDate->toDateString(),
                'support_reference' => $attributes['support_reference'],
                'notes' => $attributes['notes'] ?? null,
                'created_by' => $actor->id,
                'approved_by' => $actor->id,
                'approved_at' => now(),
            ]);

            match ($accountType) {
                'driver_cod_due' => DriverCodObligation::query()->create([
                    'driver_id' => $attributes['driver_id'],
                    'client_id' => $attributes['client_id'] ?? null,
                    'shipment_id' => null,
                    'opening_entry_id' => $entry->id,
                    'collection_date' => $effectiveDate->toDateString(),
                    'expected_amount' => $amount,
                    'collected_amount' => $amount,
                    'remitted_amount' => 0,
                    'payment_method' => 'opening_balance',
                    'status' => 'pending',
                    'reported_at' => $effectiveDate->startOfDay(),
                    'notes' => $attributes['notes'] ?? null,
                ]),
                'driver_service_payable' => DriverServiceEarning::query()->create([
                    'driver_id' => $attributes['driver_id'],
                    'shipment_id' => null,
                    'operational_task_id' => null,
                    'opening_entry_id' => $entry->id,
                    'earned_date' => $effectiveDate->toDateString(),
                    'amount' => $amount,
                    'standard_amount' => $amount,
                    'rate_snapshot_json' => [
                        'source' => 'opening_balance',
                        'opening_entry_id' => $entry->id,
                        'support_reference' => $attributes['support_reference'],
                    ],
                    'paid_amount' => 0,
                    'service_type' => 'opening_balance',
                    'status' => 'pending',
                    'notes' => $attributes['notes'] ?? null,
                ]),
                'client_cod_available' => ClientCodEntitlement::query()->create([
                    'client_id' => $attributes['client_id'],
                    'shipment_id' => null,
                    'opening_entry_id' => $entry->id,
                    'reported_amount' => $amount,
                    'available_amount' => $amount,
                    'transferred_amount' => 0,
                    'status' => 'available',
                    'available_at' => $effectiveDate->startOfDay(),
                ]),
                default => throw new \InvalidArgumentException('El tipo de saldo de apertura no es válido.'),
            };

            AuditLog::log('financial.opening_entry_created', $entry, null, $entry->toArray(), 'Saldo de apertura registrado y aprobado.');

            return $entry->fresh([
                'driver:id,name',
                'client:id,name,company',
                'createdBy:id,name',
                'approvedBy:id,name',
                'codObligation',
                'serviceEarning',
                'clientEntitlement',
            ]);
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

    private function assertReversible(string $movementType, string $status, bool $hasReversal): void
    {
        if ($movementType !== 'standard') {
            throw new \InvalidArgumentException('Un reverso no puede reversarse nuevamente.');
        }
        if ($status === 'reversed' || $hasReversal) {
            throw new \InvalidArgumentException('Este movimiento ya fue reversado.');
        }
    }

    private function entitlementStatus(int $availableAmount, int $transferredAmount): string
    {
        if ($availableAmount < 1) {
            return 'reported';
        }
        if ($transferredAmount < 1) {
            return 'available';
        }
        if ($transferredAmount >= $availableAmount) {
            return 'transferred';
        }

        return 'partial';
    }

    private function lockedPendingBalance($query): int
    {
        return (int) $query->lockForUpdate()->get()->sum(fn ($row) => $this->outstanding($row));
    }

    private function movementReference(string $prefix): string
    {
        return $prefix.'-'.now()->format('Ymd').'-'.Str::upper(Str::random(8));
    }

    /** @return array<int, array{0: object, 1: int}> */
    private function resolveAllocations($query, int $amount, array $requestedAllocations): array
    {
        $rows = $query->lockForUpdate()->get()->keyBy('id');
        if ($rows->isEmpty()) {
            throw new \InvalidArgumentException('No hay saldos pendientes para aplicar este movimiento.');
        }

        $candidates = [];
        if ($requestedAllocations) {
            $seenIds = [];
            foreach ($requestedAllocations as $request) {
                $rowId = (int) ($request['id'] ?? 0);
                $value = (int) $request['amount'];

                if (isset($seenIds[$rowId])) {
                    throw new \InvalidArgumentException('No se puede repetir la misma línea dentro de una asignación manual.');
                }

                $row = $rows->get($rowId);
                if (! $row || $value < 1 || $value > $this->outstanding($row)) {
                    throw new \InvalidArgumentException('La asignación no corresponde a un saldo pendiente.');
                }

                $seenIds[$rowId] = true;
                $candidates[] = [$row, $value];
            }
        } else {
            $remaining = $amount;
            foreach ($rows as $row) {
                if ($remaining < 1) {
                    break;
                }

                $value = min($remaining, $this->outstanding($row));
                if ($value > 0) {
                    $candidates[] = [$row, $value];
                    $remaining -= $value;
                }
            }
        }

        $allocated = array_sum(array_map(fn ($entry) => $entry[1], $candidates));
        if ($allocated > $amount) {
            throw new \InvalidArgumentException('Las asignaciones superan el valor del pago.');
        }

        if ($allocated !== $amount) {
            throw new \InvalidArgumentException('El valor del movimiento debe quedar asignado completamente a saldos pendientes.');
        }

        return $candidates;
    }

    private function outstanding(object $row): int
    {
        return $row instanceof DriverCodObligation
            ? $row->outstanding()
            : ($row instanceof DriverServiceEarning ? $row->outstanding() : $row->outstanding());
    }
}
