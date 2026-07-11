<?php

namespace App\Domain\Shipment\Observers;

use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Models\Route;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Observer que genera notificaciones cuando una ruta cambia de estado.
 */
class RouteNotificationObserver
{
    public function updated(Route $route): void
    {
        if (! $route->wasChanged('status')) {
            return;
        }

        if (! Schema::hasTable('notifications')) {
            Log::notice('routes.notification.skipped_missing_table', [
                'route_id' => $route->id,
                'table' => 'notifications',
            ]);

            return;
        }

        try {
            $newStatus = $route->status;

            if ($newStatus === 'active') {
                $this->notifyRouteStarted($route);
            } elseif ($newStatus === 'completed') {
                $this->notifyRouteCompleted($route);
            }
        } catch (Throwable $exception) {
            Log::warning('routes.notification.failed', [
                'route_id' => $route->id,
                'status' => $route->status,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    private function notifyRouteStarted(Route $route): void
    {
        $driverName = $route->driver?->name ?? 'Conductor desconocido';

        Notification::sendToRole(
            roleName: 'administrador',
            type: 'route',
            title: "🚚 Ruta iniciada",
            body: "{$driverName} inició su ruta en zona {$route->zone}. {$route->total_stops} paradas.",
            actionUrl: "/rutas/{$route->id}",
        );
    }

    private function notifyRouteCompleted(Route $route): void
    {
        $driverName = $route->driver?->name ?? 'Conductor';

        Notification::sendToRole(
            roleName: 'administrador',
            type: 'route',
            title: "✅ Ruta completada",
            body: "{$driverName} completó su ruta. {$route->completed_stops}/{$route->total_stops} paradas.",
            actionUrl: "/rutas/{$route->id}",
        );

        // Notificar al conductor
        $driverUser = User::where('name', $route->driver?->name)->first();
        if ($driverUser) {
            Notification::send(
                userId: $driverUser->id,
                type: 'route',
                title: '🎉 ¡Ruta completada!',
                body: "Completaste tu ruta del día. ¡Excelente trabajo!",
            );
        }
    }
}
