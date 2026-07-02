<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__.'/../vendor/autoload.php';

$app = require_once __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

echo 'repair-route-operations-schema.php '.date('Y-m-d H:i:s').PHP_EOL;

if (! Schema::hasTable('drivers')) {
    fwrite(STDERR, "ERROR: table drivers does not exist.\n");
    exit(1);
}

if (! Schema::hasTable('routes')) {
    fwrite(STDERR, "ERROR: table routes does not exist.\n");
    exit(1);
}

$driverLocationColumns = [
    'last_lat',
    'last_lng',
    'last_heading',
    'last_speed',
    'last_location_updated_at',
];

$routeMetricColumns = [
    'optimized_distance_meters',
    'optimized_duration_seconds',
    'remaining_distance_meters',
    'remaining_duration_seconds',
    'optimization_source',
    'optimized_at',
    'origin_lat',
    'origin_lng',
];

$routeGeometryColumns = [
    'overview_polyline',
    'route_legs',
];

$missingDriverColumns = missingColumns('drivers', $driverLocationColumns);
$missingRouteMetricColumns = missingColumns('routes', $routeMetricColumns);
$missingRouteGeometryColumns = missingColumns('routes', $routeGeometryColumns);

if ($missingDriverColumns !== []) {
    echo 'Adding missing driver live-location columns: '.implode(', ', $missingDriverColumns).PHP_EOL;

    Schema::table('drivers', function (Blueprint $table) use ($missingDriverColumns): void {
        if (in_array('last_lat', $missingDriverColumns, true)) {
            $table->decimal('last_lat', 10, 7)->nullable()->after('zone');
        }

        if (in_array('last_lng', $missingDriverColumns, true)) {
            $table->decimal('last_lng', 10, 7)->nullable()->after('last_lat');
        }

        if (in_array('last_heading', $missingDriverColumns, true)) {
            $table->decimal('last_heading', 8, 2)->nullable()->after('last_lng');
        }

        if (in_array('last_speed', $missingDriverColumns, true)) {
            $table->decimal('last_speed', 8, 2)->nullable()->after('last_heading');
        }

        if (in_array('last_location_updated_at', $missingDriverColumns, true)) {
            $table->timestamp('last_location_updated_at')->nullable()->after('last_speed');
        }
    });
}

if ($missingRouteMetricColumns !== []) {
    echo 'Adding missing route metric columns: '.implode(', ', $missingRouteMetricColumns).PHP_EOL;

    Schema::table('routes', function (Blueprint $table) use ($missingRouteMetricColumns): void {
        if (in_array('optimized_distance_meters', $missingRouteMetricColumns, true)) {
            $table->unsignedInteger('optimized_distance_meters')->nullable()->after('completed_stops');
        }

        if (in_array('optimized_duration_seconds', $missingRouteMetricColumns, true)) {
            $table->unsignedInteger('optimized_duration_seconds')->nullable()->after('optimized_distance_meters');
        }

        if (in_array('remaining_distance_meters', $missingRouteMetricColumns, true)) {
            $table->unsignedInteger('remaining_distance_meters')->nullable()->after('optimized_duration_seconds');
        }

        if (in_array('remaining_duration_seconds', $missingRouteMetricColumns, true)) {
            $table->unsignedInteger('remaining_duration_seconds')->nullable()->after('remaining_distance_meters');
        }

        if (in_array('optimization_source', $missingRouteMetricColumns, true)) {
            $table->string('optimization_source', 40)->nullable()->after('remaining_duration_seconds');
        }

        if (in_array('optimized_at', $missingRouteMetricColumns, true)) {
            $table->timestamp('optimized_at')->nullable()->after('optimization_source');
        }

        if (in_array('origin_lat', $missingRouteMetricColumns, true)) {
            $table->decimal('origin_lat', 10, 7)->nullable()->after('optimized_at');
        }

        if (in_array('origin_lng', $missingRouteMetricColumns, true)) {
            $table->decimal('origin_lng', 10, 7)->nullable()->after('origin_lat');
        }
    });
}

if ($missingRouteGeometryColumns !== []) {
    echo 'Adding missing route geometry columns: '.implode(', ', $missingRouteGeometryColumns).PHP_EOL;

    Schema::table('routes', function (Blueprint $table) use ($missingRouteGeometryColumns): void {
        if (in_array('overview_polyline', $missingRouteGeometryColumns, true)) {
            $table->longText('overview_polyline')->nullable()->after('origin_lng');
        }

        if (in_array('route_legs', $missingRouteGeometryColumns, true)) {
            $table->json('route_legs')->nullable()->after('overview_polyline');
        }
    });
}

echo 'Ensuring routes can be reopened multiple times per day.'.PHP_EOL;
ensureMultipleRoutesPerDay();

$finalState = [
    'driver_location_columns' => columnState('drivers', $driverLocationColumns),
    'route_metric_columns' => columnState('routes', $routeMetricColumns),
    'route_geometry_columns' => columnState('routes', $routeGeometryColumns),
    'multiple_routes_per_day_ready' => multipleRoutesPerDayReady(),
];

echo 'Route operations schema: '.json_encode($finalState).PHP_EOL;

if (
    in_array(false, $finalState['driver_location_columns'], true)
    || in_array(false, $finalState['route_metric_columns'], true)
    || in_array(false, $finalState['route_geometry_columns'], true)
    || $finalState['multiple_routes_per_day_ready'] !== true
) {
    fwrite(STDERR, "ERROR: route operations schema repair did not complete.\n");
    exit(1);
}

echo "OK: route operations schema repair complete.\n";

function missingColumns(string $table, array $columns): array
{
    return array_values(array_filter(
        $columns,
        fn (string $column): bool => ! Schema::hasColumn($table, $column)
    ));
}

function columnState(string $table, array $columns): array
{
    return collect($columns)
        ->mapWithKeys(fn (string $column): array => [$column => Schema::hasColumn($table, $column)])
        ->all();
}

function ensureMultipleRoutesPerDay(): void
{
    $state = routeDateCompositeIndexState();

    foreach ($state['unique_indexes'] as $indexName) {
        dropIndex('routes', $indexName);
    }

    $state = routeDateCompositeIndexState();

    if ($state['non_unique_indexes'] === []) {
        createCompositeIndex('routes_driver_id_route_date_index', 'routes', ['driver_id', 'route_date']);
    }
}

function multipleRoutesPerDayReady(): bool
{
    $state = routeDateCompositeIndexState();

    return $state['unique_indexes'] === [] && $state['non_unique_indexes'] !== [];
}

function routeDateCompositeIndexState(): array
{
    $driver = DB::connection()->getDriverName();

    if ($driver === 'mysql') {
        return routeDateCompositeIndexStateMySql();
    }

    if ($driver === 'sqlite') {
        return routeDateCompositeIndexStateSqlite();
    }

    throw new RuntimeException("Unsupported database driver for route schema repair: {$driver}");
}

function routeDateCompositeIndexStateMySql(): array
{
    $rows = DB::select('SHOW INDEX FROM routes');
    $grouped = [];

    foreach ($rows as $row) {
        $key = (string) $row->Key_name;
        $grouped[$key]['non_unique'] = (int) $row->Non_unique;
        $grouped[$key]['columns'][(int) $row->Seq_in_index] = (string) $row->Column_name;
    }

    return normalizeCompositeIndexState($grouped, fn (array $index): bool => $index['columns'] === ['driver_id', 'route_date']);
}

function routeDateCompositeIndexStateSqlite(): array
{
    $rows = DB::select("PRAGMA index_list('routes')");
    $grouped = [];

    foreach ($rows as $row) {
        $key = (string) $row->name;
        $infoRows = DB::select('PRAGMA index_info('.quoteSqliteString($key).')');
        $columns = [];

        foreach ($infoRows as $infoRow) {
            $columns[(int) $infoRow->seqno] = (string) $infoRow->name;
        }

        ksort($columns);

        $grouped[$key] = [
            'non_unique' => ((int) $row->unique) === 1 ? 0 : 1,
            'columns' => array_values($columns),
        ];
    }

    return normalizeCompositeIndexState($grouped, fn (array $index): bool => $index['columns'] === ['driver_id', 'route_date']);
}

function normalizeCompositeIndexState(array $grouped, callable $matchesTarget): array
{
    $uniqueIndexes = [];
    $nonUniqueIndexes = [];

    foreach ($grouped as $indexName => $index) {
        $columns = $index['columns'] ?? [];
        ksort($columns);
        $index['columns'] = array_values($columns);

        if (! $matchesTarget($index)) {
            continue;
        }

        if ((int) ($index['non_unique'] ?? 1) === 0) {
            $uniqueIndexes[] = (string) $indexName;
            continue;
        }

        $nonUniqueIndexes[] = (string) $indexName;
    }

    return [
        'unique_indexes' => array_values(array_unique($uniqueIndexes)),
        'non_unique_indexes' => array_values(array_unique($nonUniqueIndexes)),
    ];
}

function dropIndex(string $table, string $indexName): void
{
    $driver = DB::connection()->getDriverName();

    if ($driver === 'mysql') {
        DB::statement(sprintf('DROP INDEX `%s` ON `%s`', $indexName, $table));
        return;
    }

    if ($driver === 'sqlite') {
        DB::statement(sprintf('DROP INDEX IF EXISTS "%s"', $indexName));
        return;
    }

    throw new RuntimeException("Unsupported database driver for dropping indexes: {$driver}");
}

function createCompositeIndex(string $indexName, string $table, array $columns): void
{
    $driver = DB::connection()->getDriverName();
    $quotedColumns = array_map(
        fn (string $column): string => $driver === 'mysql' ? sprintf('`%s`', $column) : sprintf('"%s"', $column),
        $columns
    );

    if ($driver === 'mysql') {
        DB::statement(sprintf(
            'CREATE INDEX `%s` ON `%s` (%s)',
            $indexName,
            $table,
            implode(', ', $quotedColumns)
        ));
        return;
    }

    if ($driver === 'sqlite') {
        DB::statement(sprintf(
            'CREATE INDEX "%s" ON "%s" (%s)',
            $indexName,
            $table,
            implode(', ', $quotedColumns)
        ));
        return;
    }

    throw new RuntimeException("Unsupported database driver for creating indexes: {$driver}");
}

function quoteSqliteString(string $value): string
{
    return "'".str_replace("'", "''", $value)."'";
}
