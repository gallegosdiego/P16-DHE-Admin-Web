<?php

namespace App\Domain\Shipment\Observers;

use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Shipment\Jobs\NotifyShipmentStatusChanged;
use App\Domain\Shipment\Models\Shipment;
use App\Integrations\WhatsApp\Services\PickupWhatsAppNotifier;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Throwable;

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

        try {
            NotifyShipmentStatusChanged::dispatch(
                $shipment->id,
                $newStatus,
                is_object($oldStatus) ? $oldStatus->value : (string) $oldStatus,
            )->afterCommit();
        } catch (Throwable $exception) {
            Log::warning('shipments.status_notification.dispatch_failed', [
                'shipment_id' => $shipment->id,
                'status' => $newStatus,
                'message' => $exception->getMessage(),
            ]);
        }

        if ($newStatus !== 'delivered') {
            return;
        }

        if (! Schema::hasTable('pickup_packages')) {
            Log::notice('shipments.delivery_whatsapp.skipped_missing_table', [
                'shipment_id' => $shipment->id,
                'table' => 'pickup_packages',
            ]);

            return;
        }

        try {
            $pickupPackage = PickupPackage::query()
                ->with('pickupRequest.customerWhatsAppContact.whatsappContact')
                ->where('shipment_id', $shipment->id)
                ->first();

            if (! $pickupPackage?->pickupRequest) {
                return;
            }

            app(PickupWhatsAppNotifier::class)->notifyDeliveryConfirmed(
                $pickupPackage->pickupRequest,
                $shipment->fresh()
            );
        } catch (Throwable $exception) {
            Log::warning('shipments.delivery_whatsapp.failed', [
                'shipment_id' => $shipment->id,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}
