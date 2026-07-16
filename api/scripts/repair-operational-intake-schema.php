<?php

declare(strict_types=1);

use App\Domain\Operations\Services\OperationalIntakeSchema;
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

$schema = $app->make(OperationalIntakeSchema::class);
$state = $schema->inspect();
$missingTables = array_keys(array_filter(
    $state['tables'],
    fn (bool $exists): bool => ! $exists,
));

if ($missingTables !== []) {
    fwrite(STDERR, 'ERROR: missing operational tables: '.implode(', ', $missingTables).PHP_EOL);
    exit(1);
}

if (Schema::hasTable('operational_tasks') && ! Schema::hasColumn('operational_tasks', 'assigned_user_id')) {
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

$state = $schema->inspect();
$missingColumns = [];

foreach ($state['columns'] as $table => $columns) {
    foreach ($columns as $column => $exists) {
        if (! $exists) {
            $missingColumns[] = "{$table}.{$column}";
        }
    }
}

if ($missingColumns !== []) {
    fwrite(STDERR, 'ERROR: missing operational columns: '.implode(', ', $missingColumns).PHP_EOL);
    exit(1);
}

echo 'OK: operational intake schema is ready.'.PHP_EOL;
