<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Client\Models\Client;
use App\Domain\Financial\Models\ClientCodEntitlement;
use App\Domain\Financial\Models\DriverCodObligation;
use App\Domain\Financial\Models\PaymentIntent;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AssignShipmentClient
{
    public function execute(Shipment $shipment, Client $client, User $actor): Shipment
    {
        return DB::transaction(function () use ($shipment, $client, $actor): Shipment {
            $lockedShipment = Shipment::query()
                ->lockForUpdate()
                ->findOrFail($shipment->getKey());

            if (
                $lockedShipment->client_id !== null
                && (int) $lockedShipment->client_id !== (int) $client->id
            ) {
                throw ValidationException::withMessages([
                    'client_id' => 'La guía ya está vinculada a otro cliente.',
                ]);
            }

            $before = $lockedShipment->toArray();
            $lockedShipment->client_id = $client->id;
            $this->completeSenderSnapshot($lockedShipment, $client);
            $lockedShipment->save();

            $this->backfillCodLedger($lockedShipment);

            if ($this->isVerifiedDigitalPayment($lockedShipment)) {
                $lockedShipment->financial_status = 'settled';
                $lockedShipment->save();
            }

            $freshShipment = $lockedShipment->fresh(['client', 'driver']);

            AuditLog::log(
                'shipments.client_linked',
                $freshShipment,
                $before,
                $freshShipment->toArray(),
                "Guía {$freshShipment->display_code} vinculada al cliente {$client->name} después de revisión.",
            );

            return $freshShipment;
        });
    }

    private function completeSenderSnapshot(Shipment $shipment, Client $client): void
    {
        foreach ([
            'sender_name' => $client->name,
            'sender_phone' => $client->phone,
            'sender_email' => $client->email,
            'sender_company' => $client->company,
        ] as $field => $fallback) {
            if (blank($shipment->{$field}) && filled($fallback)) {
                $shipment->{$field} = $fallback;
            }
        }
    }

    private function backfillCodLedger(Shipment $shipment): void
    {
        if ($this->paymentType($shipment) !== 'cash_on_delivery' || ! $this->hasCollectedAmount($shipment)) {
            return;
        }

        $amount = $this->collectedAmount($shipment);
        $obligation = DriverCodObligation::query()
            ->where('shipment_id', $shipment->id)
            ->lockForUpdate()
            ->first();

        if ($obligation !== null) {
            $obligation->update(['client_id' => $shipment->client_id]);
        }

        if ($obligation === null && ! $this->isVerifiedDigitalPayment($shipment)) {
            return;
        }

        $entitlement = ClientCodEntitlement::query()
            ->where('shipment_id', $shipment->id)
            ->lockForUpdate()
            ->first();

        if ($entitlement !== null && (int) $entitlement->client_id !== (int) $shipment->client_id) {
            throw ValidationException::withMessages([
                'client_id' => 'La línea COD de esta guía ya pertenece a otro cliente.',
            ]);
        }

        $entitlement ??= new ClientCodEntitlement(['shipment_id' => $shipment->id]);
        $reported = max(
            (int) $entitlement->reported_amount,
            $amount,
            (int) ($obligation?->collected_amount ?? 0),
        );
        $availableFromRemittance = $this->isVerifiedDigitalPayment($shipment)
            ? $reported
            : min($reported, (int) ($obligation?->remitted_amount ?? 0));
        $available = min($reported, max(
            (int) $entitlement->available_amount,
            $availableFromRemittance,
        ));

        $entitlement->fill([
            'client_id' => $shipment->client_id,
            'driver_cod_obligation_id' => $obligation?->id,
            'reported_amount' => $reported,
            'available_amount' => $available,
            'status' => $this->entitlementStatus($available, (int) $entitlement->transferred_amount),
            'available_at' => $available > 0 ? ($entitlement->available_at ?? now()) : null,
        ])->save();
    }

    private function hasCollectedAmount(Shipment $shipment): bool
    {
        return (int) ($shipment->cod_collected_amount ?? 0) > 0
            || in_array((string) ($shipment->financial_status?->value ?? $shipment->financial_status), ['collected', 'settled'], true);
    }

    private function collectedAmount(Shipment $shipment): int
    {
        $collected = (int) ($shipment->cod_collected_amount ?? 0);

        return $collected > 0 ? $collected : (int) $shipment->cod_amount;
    }

    private function isVerifiedDigitalPayment(Shipment $shipment): bool
    {
        return PaymentIntent::query()
            ->where('shipment_id', $shipment->id)
            ->where('status', 'verified')
            ->exists();
    }

    private function paymentType(Shipment $shipment): string
    {
        return (string) ($shipment->payment_type?->value ?? $shipment->payment_type);
    }

    private function entitlementStatus(int $availableAmount, int $transferredAmount): string
    {
        if ($availableAmount < 1) {
            return 'reported';
        }

        if ($transferredAmount >= $availableAmount) {
            return 'transferred';
        }

        return 'available';
    }
}
