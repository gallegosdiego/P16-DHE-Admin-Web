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

$operationalMigrations = [
    'database/migrations/2026_07_16_140000_create_core_pickup_foundation.php',
    'database/migrations/2026_07_11_180000_create_operational_foundation_tables.php',
    'database/migrations/2026_07_11_181000_create_idempotency_records_table.php',
    'database/migrations/2026_07_12_150000_create_reconciliation_ledgers.php',
    'database/migrations/2026_07_12_170000_create_route_task_stops_table.php',
    'database/migrations/2026_07_15_100000_add_assigned_user_to_operational_tasks.php',
    'database/migrations/2026_07_15_101000_register_intake_permissions.php',
    'database/migrations/2026_07_29_100000_add_dispatch_attributes_to_shipments.php',
    'database/migrations/2026_07_29_110000_create_pickup_batch_item_evidence_table.php',
    'database/migrations/2026_07_29_120000_create_client_payment_types_table.php',
    'database/migrations/2026_07_29_121000_register_client_delete_permission.php',
    'database/migrations/2026_07_29_130000_add_company_phone_to_clients.php',
    'database/migrations/2026_07_29_131000_allow_unassigned_shipments.php',
    'database/migrations/2026_07_29_132000_allow_unassigned_pickup_requests.php',
];

runDeploymentStep('Apply operational migrations in one Laravel command', function () use ($operationalMigrations): void {
    $exitCode = Artisan::call('migrate', [
        '--force' => true,
        '--no-interaction' => true,
        '--path' => $operationalMigrations,
    ]);
    echo '    '.artisanOutputOrFallback('Operational migrations already applied.').PHP_EOL;
    if ($exitCode !== 0) {
        throw new RuntimeException("Operational migrations failed with exit code {$exitCode}");
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

$financialMigrations = [
    'database/migrations/2026_07_16_120000_create_financial_rate_rules.php',
    'database/migrations/2026_07_16_130000_add_financial_receipts_reversals_and_opening.php',
];

runDeploymentStep('Apply financial migrations in one Laravel command', function () use ($financialMigrations): void {
    $exitCode = Artisan::call('migrate', [
        '--force' => true,
        '--no-interaction' => true,
        '--path' => $financialMigrations,
    ]);
    echo '    '.artisanOutputOrFallback('Financial migrations already applied.').PHP_EOL;
    if ($exitCode !== 0) {
        throw new RuntimeException("Financial migrations failed with exit code {$exitCode}");
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
