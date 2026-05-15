<?php

namespace App\Console\Commands;

use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Console\Command;

/**
 * Detecta envíos que llevan más de 48 horas sin cambio de estado
 * y notifica a los administradores.
 *
 * Uso: php artisan shipments:check-stalled
 * Programar: $schedule->command('shipments:check-stalled')->dailyAt('09:00');
 */
class CheckStalledShipmentsCommand extends Command
{
    protected $signature = 'shipments:check-stalled {--hours=48 : Horas sin movimiento}';
    protected $description = 'Detecta envíos estancados y notifica a administradores';

    public function handle(): int
    {
        $hours = (int) $this->option('hours');
        $cutoff = now()->subHours($hours);

        $stalledStatuses = ['registered', 'confirmed', 'picked_up', 'in_warehouse', 'assigned_to_route', 'in_transit'];

        $stalled = Shipment::whereIn('status', $stalledStatuses)
            ->where('updated_at', '<', $cutoff)
            ->orderBy('updated_at', 'asc')
            ->get();

        if ($stalled->isEmpty()) {
            $this->info("✅ No hay envíos estancados (>{$hours}h).");
            return self::SUCCESS;
        }

        $count = $stalled->count();
        $this->warn("⚠️ {$count} envío(s) estancado(s) encontrado(s):");

        $details = $stalled->take(10)->map(function ($s) use ($hours) {
            $hoursStalled = now()->diffInHours($s->updated_at);
            return "• {$s->display_code} — {$s->recipient_name} — {$s->status} ({$hoursStalled}h sin cambio)";
        })->implode("\n");

        if ($count > 10) {
            $details .= "\n... y " . ($count - 10) . " más";
        }

        $body = "Se detectaron {$count} envío(s) sin movimiento en más de {$hours} horas:\n\n{$details}";

        // Notificar admins
        Notification::sendToRole(
            roleName: 'administrador',
            type: 'alert',
            title: "⚠️ {$count} envío(s) estancado(s)",
            body: $body,
            actionUrl: '/pedidos?status=stalled',
        );

        Notification::sendToRole(
            roleName: 'superadmin',
            type: 'alert',
            title: "⚠️ {$count} envío(s) estancado(s)",
            body: $body,
            actionUrl: '/pedidos?status=stalled',
        );

        $this->info($body);
        $this->newLine();
        $this->info("✅ Administradores notificados.");

        return self::SUCCESS;
    }
}
