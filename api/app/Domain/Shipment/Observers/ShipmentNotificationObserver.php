<?php

namespace App\Domain\Shipment\Observers;

use App\Domain\Shipment\Jobs\NotifyShipmentStatusChanged;
use App\Domain\Shipment\Models\Shipment;

/**
 * Observer que genera notificaciones automáticas cuando un envío cambia de estado.
 *
 * Notifica a:
 * - El conductor asignado (si tiene user_id asociado)
 * - Los admins/superadmins en casos críticos (novedades)
 */
class ShipmentNotificationObserver
{
    /**
     * Cuando un envío se actualiza, verificar si cambió de estado.
     */
    public function updated(Shipment $shipment): void
    {
        if (! $shipment->wasChanged('status')) {
            return;
        }

        $oldStatus = $shipment->getOriginal('status');
        $newStatus = is_object($shipment->status) ? $shipment->status->value : $shipment->status;

        NotifyShipmentStatusChanged::dispatch(
            $shipment->id,
            $newStatus,
            is_object($oldStatus) ? $oldStatus->value : (string) $oldStatus,
        )->afterCommit();
    }
}
