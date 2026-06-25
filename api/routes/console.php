<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Console\Command;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Schema;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('dhe:repair-cod-schema', function () {
    if (! Schema::hasTable('shipments')) {
        $this->error('Table shipments does not exist.');

        return Command::FAILURE;
    }

    Schema::table('shipments', function (Blueprint $table): void {
        if (! Schema::hasColumn('shipments', 'cod_collected_amount')) {
            $table->decimal('cod_collected_amount', 12, 0)->nullable();
        }

        if (! Schema::hasColumn('shipments', 'cod_payment_method')) {
            $table->string('cod_payment_method', 40)->nullable();
        }

        if (! Schema::hasColumn('shipments', 'cod_collected_at')) {
            $table->timestamp('cod_collected_at')->nullable();
        }
    });

    $columns = collect(['cod_collected_amount', 'cod_payment_method', 'cod_collected_at'])
        ->mapWithKeys(fn (string $column) => [$column => Schema::hasColumn('shipments', $column)])
        ->all();

    $this->info('COD collection schema: '.json_encode($columns));

    return in_array(false, $columns, true) ? Command::FAILURE : Command::SUCCESS;
})->purpose('Repair COD collection columns for constrained cPanel deployments');

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
