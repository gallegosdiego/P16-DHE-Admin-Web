<?php

namespace App\Domain\Shipment\Observers;

use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;

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

        // Notificar al conductor asignado
        $this->notifyDriver($shipment, $newStatus);

        // Notificar a admins si hay novedad
        if ($newStatus === 'issue') {
            $this->notifyAdminsOfIssue($shipment);
        }
    }

    /**
     * Notificar al conductor cuando se le asigna un envío o cambia de estado.
     */
    private function notifyDriver(Shipment $shipment, string $newStatus): void
    {
        if (! $shipment->driver_id) {
            return;
        }

        // Buscar el user_id del conductor
        $driverUser = User::where('name', $shipment->driver?->name)->first();
        if (! $driverUser) {
            return;
        }

        $titles = [
            'confirmed' => '📦 Envío confirmado',
            'assigned_to_route' => '🗺️ Envío asignado a tu ruta',
            'in_transit' => '🚚 Envío en ruta',
            'delivered' => '✅ Entrega confirmada',
            'issue' => '⚠️ Novedad registrada',
            'returned' => '↩️ Envío devuelto',
        ];

        $title = $titles[$newStatus] ?? "📋 Estado actualizado: {$newStatus}";
        $body = "{$shipment->display_code} — {$shipment->recipient_name}";

        if ($newStatus === 'issue' && $shipment->issue_note) {
            $body .= "\nNovedad: {$shipment->issue_note}";
        }

        Notification::send(
            userId: $driverUser->id,
            type: 'shipment',
            title: $title,
            body: $body,
            actionUrl: "/shipments/{$shipment->id}",
            metadata: [
                'shipment_id' => $shipment->id,
                'display_code' => $shipment->display_code,
                'status' => $newStatus,
            ],
        );
    }

    /**
     * Notificar a los administradores cuando hay una novedad.
     */
    private function notifyAdminsOfIssue(Shipment $shipment): void
    {
        $issueNote = $shipment->issue_note ?? 'Sin nota';
        $driverName = $shipment->driver?->name ?? 'Sin conductor';

        Notification::sendToRole(
            roleName: 'admin',
            type: 'shipment',
            title: "⚠️ Novedad: {$shipment->display_code}",
            body: "Conductor: {$driverName}\nDestinatario: {$shipment->recipient_name}\nNota: {$issueNote}",
            actionUrl: "/pedidos/{$shipment->id}",
        );

        // También notificar a superadmins
        Notification::sendToRole(
            roleName: 'superadmin',
            type: 'shipment',
            title: "⚠️ Novedad: {$shipment->display_code}",
            body: "Conductor: {$driverName}\nDestinatario: {$shipment->recipient_name}\nNota: {$issueNote}",
            actionUrl: "/pedidos/{$shipment->id}",
        );
    }
}
