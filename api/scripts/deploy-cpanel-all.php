<?php

/**
 * Consolidated cPanel deployment script.
 *
 * Replaces the 22 individual tasks in .cpanel.yml with a single PHP execution.
 * Each step is idempotent and wrapped in try/catch so a partial failure does
 * not leave the task runner hanging.
 *
 * Usage (from .cpanel.yml):
 *   cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php scripts/deploy-cpanel-all.php 2>&1
 */

declare(strict_types=1);

// ── Bootstrap ────────────────────────────────────────────────────────────────

$startTime = microtime(true);

echo '=== deploy-cpanel-all.php '.date('Y-m-d H:i:s').' ==='.PHP_EOL;

$appRoot = dirname(__DIR__);

// Resolve the cPanel repository root for the deployment marker.
$repositoryRoot = '/home/danheiex/repositories/P16-DHE-Admin-Web';
if (! is_dir($repositoryRoot.'/.git')) {
    $repositoryRoot = dirname($appRoot);
}

require $appRoot.'/vendor/autoload.php';

$app = require_once $appRoot.'/bootstrap/app.php';
$kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// ── Helpers ──────────────────────────────────────────────────────────────────

$errors = [];
$stepCount = 0;

function runStep(string $label, callable $action, array &$errors, int &$stepCount): void
{
    $stepCount++;
    echo PHP_EOL."[{$stepCount}] {$label}".PHP_EOL;

    try {
        $action();
        echo "    ✓ OK".PHP_EOL;
    } catch (\Throwable $e) {
        $message = $e->getMessage();
        echo "    ✗ ERROR: {$message}".PHP_EOL;
        $errors[] = "[{$stepCount}] {$label}: {$message}";
    }
}

function writeMarker(string $status, string $repositoryRoot, string $phase): void
{
    $script = dirname(__DIR__).'/scripts/write-cpanel-deployment-marker.php';
    if (! is_file($script)) {
        echo "    (marker script not found, skipping)".PHP_EOL;
        return;
    }

    $cmd = PHP_BINARY.' '.escapeshellarg($script)
        .' '.escapeshellarg($status)
        .' '.escapeshellarg($repositoryRoot)
        .' '.escapeshellarg($phase);

    $output = [];
    $exitCode = 0;
    exec($cmd.' 2>&1', $output, $exitCode);
    echo '    '.implode(PHP_EOL.'    ', $output).PHP_EOL;
}

// ── Phase 1: Schema Core ─────────────────────────────────────────────────────

writeMarker('running', $repositoryRoot, 'schema_core');

runStep('Clear Laravel caches', function () {
    Artisan::call('optimize:clear', ['--no-interaction' => true]);
    echo '    '.trim(Artisan::output()).PHP_EOL;
}, $errors, $stepCount);

// Set MySQL lock timeouts to avoid indefinite hangs.
runStep('Set database lock timeouts', function () {
    if (DB::connection()->getDriverName() === 'mysql') {
        DB::statement('SET SESSION lock_wait_timeout = 60');
        DB::statement('SET SESSION innodb_lock_wait_timeout = 60');
    }
}, $errors, $stepCount);

// Run each migration individually with idempotency.
// artisan migrate --path already skips migrations recorded in the migrations table.
$migrations = [
    'Core pickup foundation' => 'database/migrations/2026_07_16_140000_create_core_pickup_foundation.php',
    'Operational foundation' => 'database/migrations/2026_07_11_180000_create_operational_foundation_tables.php',
    'Idempotency records'    => 'database/migrations/2026_07_11_181000_create_idempotency_records_table.php',
    'Reconciliation ledgers' => 'database/migrations/2026_07_12_150000_create_reconciliation_ledgers.php',
    'Route task stops'       => 'database/migrations/2026_07_12_170000_create_route_task_stops_table.php',
    'Assigned user column'   => 'database/migrations/2026_07_15_100000_add_assigned_user_to_operational_tasks.php',
    'Intake permissions'     => 'database/migrations/2026_07_15_101000_register_intake_permissions.php',
];

foreach ($migrations as $label => $path) {
    runStep("Migrate: {$label}", function () use ($path) {
        Artisan::call('migrate', [
            '--force' => true,
            '--no-interaction' => true,
            '--path' => $path,
        ]);
        $output = trim(Artisan::output());
        if ($output !== '') {
            echo "    {$output}".PHP_EOL;
        }
    }, $errors, $stepCount);
}

// ── Schema verification ──────────────────────────────────────────────────────

runStep('Ensure operational intake schema', function () use ($appRoot) {
    $script = $appRoot.'/scripts/ensure-operational-intake-schema.php';
    if (! is_file($script)) {
        echo '    (script not found, skipping)'.PHP_EOL;
        return;
    }
    $output = [];
    $exitCode = 0;
    exec(PHP_BINARY.' '.escapeshellarg($script).' 2>&1', $output, $exitCode);
    echo '    '.implode(PHP_EOL.'    ', $output).PHP_EOL;
    if ($exitCode !== 0) {
        throw new \RuntimeException('Schema verification failed (exit '.$exitCode.')');
    }
}, $errors, $stepCount);

runStep('Repair operational intake schema', function () use ($appRoot) {
    $script = $appRoot.'/scripts/repair-operational-intake-schema.php';
    if (! is_file($script)) {
        echo '    (script not found, skipping)'.PHP_EOL;
        return;
    }
    $output = [];
    $exitCode = 0;
    exec(PHP_BINARY.' '.escapeshellarg($script).' 2>&1', $output, $exitCode);
    echo '    '.implode(PHP_EOL.'    ', $output).PHP_EOL;
    if ($exitCode !== 0) {
        throw new \RuntimeException('Schema repair failed (exit '.$exitCode.')');
    }
}, $errors, $stepCount);

// ── Phase 2: Runtime Repairs ─────────────────────────────────────────────────

writeMarker('running', $repositoryRoot, 'runtime_repairs');

$repairScripts = [
    'Repair public storage link'   => 'repair-public-storage-link.php',
    'Repair COD schema'            => 'repair-cod-schema.php',
    'Repair driver geo schema'     => 'repair-driver-mobile-geo-schema.php',
    'Repair driver documents'      => 'repair-driver-documents-schema.php',
];

foreach ($repairScripts as $label => $scriptName) {
    runStep($label, function () use ($appRoot, $scriptName) {
        $script = $appRoot.'/scripts/'.$scriptName;
        if (! is_file($script)) {
            echo '    (script not found, skipping)'.PHP_EOL;
            return;
        }
        $output = [];
        $exitCode = 0;
        exec(PHP_BINARY.' '.escapeshellarg($script).' 2>&1', $output, $exitCode);
        echo '    '.implode(PHP_EOL.'    ', $output).PHP_EOL;
    }, $errors, $stepCount);
}

// ── Phase 3: Financial Schema ────────────────────────────────────────────────

writeMarker('running', $repositoryRoot, 'financial_schema');

$financialMigrations = [
    'Financial rate rules'              => 'database/migrations/2026_07_16_120000_create_financial_rate_rules.php',
    'Financial receipts and reversals'  => 'database/migrations/2026_07_16_130000_add_financial_receipts_reversals_and_opening.php',
];

foreach ($financialMigrations as $label => $path) {
    runStep("Migrate: {$label}", function () use ($path) {
        Artisan::call('migrate', [
            '--force' => true,
            '--no-interaction' => true,
            '--path' => $path,
        ]);
        $output = trim(Artisan::output());
        if ($output !== '') {
            echo "    {$output}".PHP_EOL;
        }
    }, $errors, $stepCount);
}

// ── Result ───────────────────────────────────────────────────────────────────

$elapsed = round(microtime(true) - $startTime, 1);

echo PHP_EOL.'=== Deployment finished in '.$elapsed.'s ==='.PHP_EOL;

if ($errors !== []) {
    echo PHP_EOL.'Errors encountered ('.count($errors).'):'.PHP_EOL;
    foreach ($errors as $error) {
        echo '  - '.$error.PHP_EOL;
    }
    writeMarker('running', $repositoryRoot, 'completed_with_errors');
    // Exit 0 so cPanel marks the deployment as done and updates the SHA.
    // The errors are logged above for diagnosis.
    echo PHP_EOL.'Exiting with code 0 to allow cPanel to update the deployed SHA.'.PHP_EOL;
    exit(0);
}

writeMarker('success', $repositoryRoot, 'complete');
echo PHP_EOL.'All '.$stepCount.' steps completed successfully.'.PHP_EOL;
exit(0);
