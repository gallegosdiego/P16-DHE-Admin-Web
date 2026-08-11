<?php

/**
 * Consolidated cPanel deployment.
 *
 * cPanel sees exactly one PHP task. The script keeps the operational intake
 * schema on the critical path, records an explicit failed marker when that
 * path cannot finish, and still exits in a controlled way so repeated failed
 * UserTasks are not left queued by the shared-hosting task runner.
 */

declare(strict_types=1);

use App\Domain\Operations\Exceptions\OperationalIntakeUnavailable;
use App\Domain\Operations\Services\OperationalIntakeSchemaRecovery;
use App\Support\CpanelDeploymentMarker;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$startedAt = microtime(true);
$appRoot = dirname(__DIR__);
$repositoryRoot = getenv('DANHEI_REPOSITORY_ROOT') ?: '/home/danheiex/repositories/P16-DHE-Admin-Web';
$logDirectory = $appRoot.'/storage/logs';

echo '=== deploy-cpanel-all.php '.date('Y-m-d H:i:s').' ==='.PHP_EOL;

require $appRoot.'/vendor/autoload.php';

$marker = new CpanelDeploymentMarker($repositoryRoot, $logDirectory);
$errors = [];
$warnings = [];
$stepCount = 0;

/**
 * @param  list<string>  $errors
 * @param  list<string>  $warnings
 */
function runDeploymentStep(
    string $label,
    callable $action,
    array &$errors,
    array &$warnings,
    int &$stepCount,
    bool $critical = true,
): void {
    $stepCount++;
    echo PHP_EOL."[{$stepCount}] {$label}".PHP_EOL;

    try {
        $action();
        echo '    OK'.PHP_EOL;
    } catch (Throwable $exception) {
        $message = deploymentErrorMessage($exception);
        echo "    ERROR: {$message}".PHP_EOL;

        if ($critical) {
            $errors[] = "[{$stepCount}] {$label}: {$message}";
        } else {
            $warnings[] = "[{$stepCount}] {$label}: {$message}";
        }
    }
}

function deploymentErrorMessage(Throwable $exception): string
{
    $message = trim($exception->getMessage()) ?: $exception::class;

    if ($exception instanceof OperationalIntakeUnavailable) {
        if ($exception->missingTables !== []) {
            $message .= '; missing tables: '.implode(', ', $exception->missingTables);
        }
        if ($exception->missingColumns !== []) {
            $message .= '; missing columns: '.implode(', ', $exception->missingColumns);
        }
    }

    return $message;
}

function artisanOutputOrFallback(string $fallback): string
{
    $output = trim(Artisan::output());

    return $output !== '' ? $output : $fallback;
}

function runPhpRepair(string $appRoot, string $scriptName): void
{
    $script = $appRoot.'/scripts/'.$scriptName;
    if (! is_file($script)) {
        throw new RuntimeException("Repair script is missing: {$scriptName}");
    }
    if (! function_exists('exec')) {
        throw new RuntimeException("PHP exec is unavailable for optional repair: {$scriptName}");
    }

    $output = [];
    $exitCode = 0;
    exec(PHP_BINARY.' '.escapeshellarg($script).' 2>&1', $output, $exitCode);
    if ($output !== []) {
        echo '    '.implode(PHP_EOL.'    ', $output).PHP_EOL;
    }
    if ($exitCode !== 0) {
        throw new RuntimeException("Repair {$scriptName} failed with exit code {$exitCode}");
    }
}

/**
 * cPanel must finish the UserTask even when Laravel reports an error. The
 * failed marker is the authoritative result consumed by the API and panel.
 *
 * @param  list<string>  $errors
 */
function finishControlledFailure(
    CpanelDeploymentMarker $marker,
    string $phase,
    array $errors,
    float $startedAt,
): never {
    try {
        $values = $marker->failed($phase, 1);
        echo PHP_EOL."Deployment marker: {$values['status']} {$values['commit']} {$values['phase']}".PHP_EOL;
    } catch (Throwable $markerError) {
        echo PHP_EOL.'ERROR writing failed marker: '.$markerError->getMessage().PHP_EOL;
    }

    echo PHP_EOL.'Critical errors ('.count($errors).'):'.PHP_EOL;
    foreach ($errors as $error) {
        echo '  - '.$error.PHP_EOL;
    }
    echo 'Controlled finish after '.round(microtime(true) - $startedAt, 1).'s.'.PHP_EOL;
    exit(0);
}

try {
    $runningMarker = $marker->running('schema_core');
    echo "Deployment marker: {$runningMarker['status']} {$runningMarker['commit']} {$runningMarker['phase']}".PHP_EOL;
} catch (Throwable $exception) {
    echo 'ERROR: deployment marker initialization failed: '.$exception->getMessage().PHP_EOL;
    exit(0);
}

try {
    $app = require_once $appRoot.'/bootstrap/app.php';
    $kernel = $app->make(Kernel::class);
    $kernel->bootstrap();
} catch (Throwable $exception) {
    finishControlledFailure(
        $marker,
        'bootstrap_failed',
        ['Bootstrap Laravel: '.deploymentErrorMessage($exception)],
        $startedAt,
    );
}

runDeploymentStep('Clear Laravel caches', function (): void {
    $exitCode = Artisan::call('optimize:clear', ['--no-interaction' => true]);
    echo '    '.artisanOutputOrFallback('Laravel caches cleared.').PHP_EOL;
    if ($exitCode !== 0) {
        throw new RuntimeException("optimize:clear failed with exit code {$exitCode}");
    }
}, $errors, $warnings, $stepCount);

runDeploymentStep('Set database lock timeouts', function (): void {
    if (DB::connection()->getDriverName() === 'mysql') {
        DB::statement('SET SESSION lock_wait_timeout = 60');
        DB::statement('SET SESSION innodb_lock_wait_timeout = 60');
    }
}, $errors, $warnings, $stepCount);

/**
 * Reconciliación del historial de migraciones.
 *
 * Producción llegó a un estado donde ciertas columnas existían físicamente
 * —creadas por los `repair-*.php` fuera del sistema de migraciones— pero su
 * migración no figuraba en la tabla `migrations`. Ejecutarlas produciría
 * `Duplicate column name`, así que se registran sin ejecutar.
 *
 * Cada entrada declara las columnas que la migración debe haber creado.
 * El registro **solo** se escribe si TODAS están presentes: en una base nueva
 * no se registra nada y `migrate` hace su trabajo normal. Esto mantiene el
 * paso seguro en cualquier entorno (local, CI, producción) y lo vuelve
 * idempotente: repetirlo no duplica filas ni altera el esquema.
 *
 * @var array<string, array{table: string, columns: list<string>}>
 */
$materializedMigrations = [
    '2026_06_19_050000_add_coordinates_to_shipments' => [
        'table' => 'shipments',
        'columns' => ['recipient_lat', 'recipient_lng', 'geocoded_at'],
    ],
    '2026_06_25_010000_add_cod_collection_fields_to_shipments' => [
        'table' => 'shipments',
        'columns' => ['cod_collected_amount', 'cod_payment_method', 'cod_collected_at'],
    ],
    '2026_07_01_180000_add_route_metric_columns_to_routes_table' => [
        'table' => 'routes',
        'columns' => [
            'optimized_distance_meters', 'optimized_duration_seconds',
            'remaining_distance_meters', 'remaining_duration_seconds',
            'optimization_source', 'optimized_at', 'origin_lat', 'origin_lng',
        ],
    ],
    '2026_07_01_190000_add_route_geometry_columns_to_routes_table' => [
        'table' => 'routes',
        'columns' => ['overview_polyline', 'route_legs'],
    ],
    '2026_07_02_210000_add_document_columns_to_drivers_table' => [
        'table' => 'drivers',
        'columns' => [
            'driver_license_photo', 'vehicle_registration_photo', 'soat_photo',
            'technical_inspection_photo', 'national_id_front_photo', 'national_id_back_photo',
        ],
    ],
    '2026_07_02_230000_add_document_expiry_columns_to_drivers_table' => [
        'table' => 'drivers',
        'columns' => ['driver_license_expires_at', 'soat_expires_at', 'technical_inspection_expires_at'],
    ],
];

runDeploymentStep('Reconcile migration history', function () use ($materializedMigrations): void {
    if (! Schema::hasTable('migrations')) {
        throw new RuntimeException('The migrations table does not exist.');
    }

    $registered = DB::table('migrations')->pluck('migration')->all();
    $batch = (int) DB::table('migrations')->max('batch') + 1;
    $adopted = [];

    foreach ($materializedMigrations as $migration => $expected) {
        if (in_array($migration, $registered, true)) {
            continue;
        }

        if (! Schema::hasTable($expected['table'])) {
            continue;
        }

        foreach ($expected['columns'] as $column) {
            if (! Schema::hasColumn($expected['table'], $column)) {
                // El esquema no está materializado: que la aplique `migrate`.
                continue 2;
            }
        }

        DB::table('migrations')->insert([
            'migration' => $migration,
            'batch' => $batch,
        ]);
        $adopted[] = $migration;
    }

    if ($adopted === []) {
        echo '    Migration history already consistent.'.PHP_EOL;

        return;
    }

    echo '    Adopted '.count($adopted).' already-materialized migrations into batch '.$batch.':'.PHP_EOL;
    foreach ($adopted as $migration) {
        echo '      - '.$migration.PHP_EOL;
    }
}, $errors, $warnings, $stepCount);

runDeploymentStep('Apply all pending migrations', function (): void {
    // Sin `--path`. La lista blanca anterior dejaba fuera toda migración que
    // nadie recordara añadir a mano, y el fallo era silencioso. La cobertura
    // completa la vigila `tests/Unit/DeployMigrationCoverageTest.php`.
    $exitCode = Artisan::call('migrate', [
        '--force' => true,
        '--no-interaction' => true,
    ]);
    echo '    '.artisanOutputOrFallback('No pending migrations.').PHP_EOL;
    if ($exitCode !== 0) {
        throw new RuntimeException("Migrations failed with exit code {$exitCode}");
    }
}, $errors, $warnings, $stepCount);

runDeploymentStep('Recover and verify operational intake schema', function () use ($app): void {
    $state = $app->make(OperationalIntakeSchemaRecovery::class)->recover();
    echo '    operational_intake_ready='.($state['ready'] ? 'true' : 'false').PHP_EOL;
}, $errors, $warnings, $stepCount);

if ($errors !== []) {
    finishControlledFailure($marker, 'schema_core_failed', $errors, $startedAt);
}

try {
    $marker->running('runtime_repairs');
} catch (Throwable $exception) {
    $warnings[] = 'Runtime marker: '.$exception->getMessage();
}

foreach ([
    'repair-public-storage-link.php',
    'repair-cod-schema.php',
    'repair-driver-mobile-geo-schema.php',
    'repair-driver-documents-schema.php',
] as $repairScript) {
    runDeploymentStep(
        "Optional runtime repair: {$repairScript}",
        fn () => runPhpRepair($appRoot, $repairScript),
        $errors,
        $warnings,
        $stepCount,
        false,
    );
}

try {
    $marker->running('financial_schema');
} catch (Throwable $exception) {
    $warnings[] = 'Financial marker: '.$exception->getMessage();
}

// Las migraciones financieras ya no necesitan un paso propio: el paso
// «Apply all pending migrations» cubre el directorio completo. La fase se
// conserva en el marcador para no romper a los consumidores del estado.
runDeploymentStep('Verify no migrations remain pending', function (): void {
    $exitCode = Artisan::call('migrate', [
        '--force' => true,
        '--no-interaction' => true,
    ]);
    echo '    '.artisanOutputOrFallback('No pending migrations.').PHP_EOL;
    if ($exitCode !== 0) {
        throw new RuntimeException("Final migration check failed with exit code {$exitCode}");
    }
}, $errors, $warnings, $stepCount);

if ($errors !== []) {
    finishControlledFailure($marker, 'financial_schema_failed', $errors, $startedAt);
}

$completionPhase = $warnings === [] ? 'complete' : 'complete_with_warnings';

try {
    $successMarker = $marker->success($completionPhase);
    echo PHP_EOL."Deployment marker: {$successMarker['status']} {$successMarker['commit']} {$successMarker['phase']}".PHP_EOL;
} catch (Throwable $exception) {
    echo PHP_EOL.'ERROR writing success marker: '.$exception->getMessage().PHP_EOL;
    exit(0);
}

if ($warnings !== []) {
    echo PHP_EOL.'Non-blocking warnings ('.count($warnings).'):'.PHP_EOL;
    foreach ($warnings as $warning) {
        echo '  - '.$warning.PHP_EOL;
    }
}

echo PHP_EOL.'All '.$stepCount.' deployment steps finished in '
    .round(microtime(true) - $startedAt, 1).'s.'.PHP_EOL;
exit(0);
