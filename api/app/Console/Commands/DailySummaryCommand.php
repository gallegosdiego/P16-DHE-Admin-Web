<?php

namespace App\Console\Commands;

use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * Genera un resumen diario de operaciones y notifica a los administradores.
 *
 * Uso: php artisan daily:summary
 * Programar en scheduler: $schedule->command('daily:summary')->dailyAt('20:00');
 */
class DailySummaryCommand extends Command
{
    protected $signature = 'daily:summary {--date= : Fecha a resumir (YYYY-MM-DD), por defecto hoy}';
    protected $description = 'Genera resumen diario de operaciones y notifica a administradores';

    public function handle(): int
    {
        $date = $this->option('date') ?? now()->toDateString();

        $this->info("📊 Generando resumen para {$date}...");

        // Shipment stats
        $totalShipments = Shipment::whereDate('created_at', $date)->count();
        $delivered = Shipment::where('status', 'delivered')->whereDate('delivered_at', $date)->count();
        $issues = Shipment::where('status', 'issue')->whereDate('updated_at', $date)->count();
        $returned = Shipment::where('status', 'returned')->whereDate('updated_at', $date)->count();

        // Route stats
        $totalRoutes = Route::whereDate('route_date', $date)->count();
        $completedRoutes = Route::where('status', 'completed')->whereDate('route_date', $date)->count();
        $totalStops = Route::whereDate('route_date', $date)->sum('total_stops');
        $completedStops = Route::whereDate('route_date', $date)->sum('completed_stops');

        // Financial
        $codCollected = Shipment::where('status', 'delivered')
            ->where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'collected')
            ->whereDate('delivered_at', $date)
            ->sum('cod_amount');

        $shippingRevenue = Shipment::where('status', 'delivered')
            ->whereDate('delivered_at', $date)
            ->sum('shipping_cost');

        // Calculate success rate
        $deliveryAttempts = $delivered + $issues + $returned;
        $successRate = $deliveryAttempts > 0
            ? round(($delivered / $deliveryAttempts) * 100, 1)
            : 0;

        // Format financials
        $codFormatted = '$' . number_format($codCollected, 0, ',', '.');
        $shipFormatted = '$' . number_format($shippingRevenue, 0, ',', '.');

        // Build summary
        $summary = <<<EOT
Resumen del {$date}

Envios: {$totalShipments} registrados
Entregados: {$delivered}
Novedades: {$issues}
Devueltos: {$returned}
Tasa de exito: {$successRate}%

Rutas: {$completedRoutes}/{$totalRoutes} completadas
Paradas: {$completedStops}/{$totalStops} completadas

COD recaudado: {$codFormatted}
Ingresos envio: {$shipFormatted}
EOT;

        // Notify admins
        $count = Notification::sendToRole(
            roleName: 'administrador',
            type: 'system',
            title: "📊 Resumen diario — {$date}",
            body: $summary,
            actionUrl: '/dashboard',
        );

        // Also superadmins
        $count += Notification::sendToRole(
            roleName: 'superadmin',
            type: 'system',
            title: "📊 Resumen diario — {$date}",
            body: $summary,
            actionUrl: '/dashboard',
        );

        $this->info($summary);
        $this->newLine();
        $this->info("✅ Notificado a {$count} administrador(es).");

        return self::SUCCESS;
    }
}
