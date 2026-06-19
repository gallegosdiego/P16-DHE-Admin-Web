<?php

namespace App\Domain\Shipment\Jobs;

use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Job que envía notificaciones cuando un envío cambia de estado.
 *
 * Notifica a:
 * - El conductor asignado (si tiene user_id asociado)
 * - Los admins/superadmins en casos críticos (novedades)
 */
class NotifyShipmentStatusChanged implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public readonly int $shipmentId,
        public readonly string $newStatus,
        public readonly string $oldStatus,
    ) {}

    public function handle(): void
    {
        $shipment = Shipment::with('driver.user')->find($this->shipmentId);

        if (! $shipment) {
            return;
        }

        // Notificar al conductor asignado
        $this->notifyDriver($shipment, $this->newStatus);

        // Notificar a admins si hay novedad
        if ($this->newStatus === 'issue') {
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

        // Usar la relación FK existente: Driver → User
        $driverUser = $shipment->driver?->user;
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

        $payload = [
            'type' => 'shipment',
            'title' => "⚠️ Novedad: {$shipment->display_code}",
            'body' => "Conductor: {$driverName}\nDestinatario: {$shipment->recipient_name}\nNota: {$issueNote}",
            'actionUrl' => "/pedidos/{$shipment->id}",
        ];

        // Notificar a administradores y superadmins
        foreach (['administrador', 'superadmin'] as $role) {
            Notification::sendToRole(
                roleName: $role,
                type: $payload['type'],
                title: $payload['title'],
                body: $payload['body'],
                actionUrl: $payload['actionUrl'],
            );
        }
    }
}
