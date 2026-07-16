<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__.'/../vendor/autoload.php';

$app = require_once __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

echo 'repair-operational-intake-schema.php '.date('Y-m-d H:i:s').PHP_EOL;

if (DB::connection()->getDriverName() === 'mysql') {
    DB::statement('SET SESSION lock_wait_timeout = 30');
    DB::statement('SET SESSION innodb_lock_wait_timeout = 30');
}

$requiredTables = [
    'service_locations',
    'pickup_requests',
    'pickup_packages',
    'pickup_review_events',
    'operational_tasks',
    'pickup_batches',
    'pickup_batch_items',
    'delivery_attempts',
    'shipment_evidence',
    'custody_events',
    'idempotency_records',
];

$missingTables = array_values(array_filter(
    $requiredTables,
    fn (string $table): bool => ! Schema::hasTable($table),
));

if ($missingTables !== []) {
    fwrite(STDERR, 'ERROR: missing operational tables: '.implode(', ', $missingTables).PHP_EOL);
    exit(1);
}

if (! Schema::hasColumn('operational_tasks', 'assigned_user_id')) {
    echo 'Adding missing operational_tasks.assigned_user_id column'.PHP_EOL;

    Schema::table('operational_tasks', function (Blueprint $table): void {
        $table->foreignId('assigned_user_id')
            ->nullable()
            ->after('assigned_driver_id')
            ->constrained('users')
            ->nullOnDelete();

        $table->index(['assigned_user_id', 'status']);
    });
}

$requiredColumns = [
    'pickup_requests' => [
        'intake_mode',
        'service_location_id',
        'planned_dropoff_at',
    ],
    'pickup_packages' => [
        'shipment_id',
        'guide_number',
        'qr_reference',
    ],
    'operational_tasks' => [
        'pickup_request_id',
        'service_location_id',
        'assigned_user_id',
    ],
    'pickup_batches' => [
        'operational_task_id',
        'delivered_by_name',
        'received_by',
    ],
    'custody_events' => [
        'shipment_id',
        'event_type',
        'actor_user_id',
    ],
];

$missingColumns = [];

foreach ($requiredColumns as $table => $columns) {
    foreach ($columns as $column) {
        if (! Schema::hasColumn($table, $column)) {
            $missingColumns[] = "{$table}.{$column}";
        }
    }
}

if ($missingColumns !== []) {
    fwrite(STDERR, 'ERROR: missing operational columns: '.implode(', ', $missingColumns).PHP_EOL);
    exit(1);
}

echo 'OK: operational intake schema is ready.'.PHP_EOL;
