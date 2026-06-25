<?php

namespace App\Domain\Shipment\Actions;

use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Models\ShipmentEvent;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class TransitionShipmentStatus
{
    /**
     * Ejecuta una transición de estado validada.
     *
     * @throws \InvalidArgumentException Si la transición no es válida
     */
    public function execute(Shipment $shipment, ShipmentStatus $newStatus, User $user, ?string $description = null, ?array $metadata = null): Shipment
    {
        if (! $shipment->canTransitionTo($newStatus)) {
            $from = $shipment->status->label();
            $to = $newStatus->label();
            throw new \InvalidArgumentException("Transición no permitida: {$from} → {$to}");
        }

        return DB::transaction(function () use ($shipment, $newStatus, $user, $description, $metadata) {
            $oldStatus = $shipment->status;

            $shipment->update(['status' => $newStatus]);

            // Timestamps automáticos
            if ($newStatus === ShipmentStatus::PICKED_UP) {
                $shipment->update(['picked_up_at' => now()]);
            }
            if ($newStatus === ShipmentStatus::DELIVERED) {
                $shipment->update(['delivered_at' => now()]);
                // Auto-marcar contra entrega como "collected" si estaba pending
                if ($shipment->payment_type->value === 'cash_on_delivery' && $shipment->getRawOriginal('financial_status') === 'pending') {
                    $codUpdates = ['financial_status' => 'collected'];

                    if (Shipment::supportsCodCollectionFields() && $shipment->cod_collected_amount === null) {
                        $codUpdates['cod_collected_amount'] = (int) $shipment->cod_amount;
                    }
                    if (Shipment::supportsCodCollectionFields() && $shipment->cod_collected_at === null) {
                        $codUpdates['cod_collected_at'] = now();
                    }

                    $shipment->update($codUpdates);
                }
            }

            // Crear evento auditable
            ShipmentEvent::create([
                'shipment_id' => $shipment->id,
                'user_id' => $user->id,
                'from_status' => $oldStatus->value,
                'to_status' => $newStatus->value,
                'description' => $description ?? "Estado cambiado a {$newStatus->label()}",
                'metadata' => $metadata,
                'occurred_at' => now(),
            ]);

            return $shipment->fresh();
        });
    }
}
