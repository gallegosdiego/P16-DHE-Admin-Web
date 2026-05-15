<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
|--------------------------------------------------------------------------
| Scheduled Tasks — Danhei Express
|--------------------------------------------------------------------------
|
| Para activar en producción, agregar al crontab del servidor:
| * * * * * cd /path-to-project && php artisan schedule:run >> /dev/null 2>&1
|
*/

// Resumen diario a las 8pm (hora Colombia)
Schedule::command('daily:summary')->dailyAt('20:00')->timezone('America/Bogota');

// Detectar envíos estancados cada mañana a las 9am
Schedule::command('shipments:check-stalled')->dailyAt('09:00')->timezone('America/Bogota');
