<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
|--------------------------------------------------------------------------
| Scheduled Tasks - Danhei Express
|--------------------------------------------------------------------------
|
| Para activar en produccion, agregar al crontab del servidor:
| * * * * * cd /path-to-project && php artisan schedule:run >> /dev/null 2>&1
|
*/

// Resumen diario a las 8pm (hora Colombia)
Schedule::command('daily:summary')->dailyAt('20:00')->timezone('America/Bogota');

// Detectar envios estancados cada manana a las 9am
Schedule::command('shipments:check-stalled')->dailyAt('09:00')->timezone('America/Bogota');

// Reconciliar alertas documentales para panel operativo
Schedule::command('drivers:sync-document-alerts')
    ->everyThirtyMinutes()
    ->timezone('America/Bogota')
    ->withoutOverlapping()
    ->appendOutputTo(storage_path('logs/drivers-sync-document-alerts.log'));

// Reintentar geocodificacion de backlog reciente sin saturar proveedores
Schedule::command('shipments:geocode-missing --limit=50 --json')
    ->hourly()
    ->timezone('America/Bogota')
    ->withoutOverlapping()
    ->appendOutputTo(storage_path('logs/shipments-geocode-missing.log'));

// Auditar y autoreparar consistencia operativa de rutas
Schedule::command('operations:audit-integrity --fix --json --store-report')
    ->everyThirtyMinutes()
    ->timezone('America/Bogota')
    ->withoutOverlapping()
    ->appendOutputTo(storage_path('logs/operations-audit-integrity.log'));
