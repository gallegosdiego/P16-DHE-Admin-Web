<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__.'/../vendor/autoload.php';

$app = require_once __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

echo 'repair-route-day-index.php '.date('Y-m-d H:i:s').PHP_EOL;

if (! Schema::hasTable('routes')) {
    fwrite(STDERR, "ERROR: table routes does not exist.\n");
    exit(1);
}

$driver = DB::connection()->getDriverName();

if ($driver !== 'mysql') {
    echo "INFO: route day index repair is only required for mysql runtime deploys.\n";
    exit(0);
}

// Avoid waiting indefinitely for a metadata lock held by an active request.
DB::statement('SET SESSION lock_wait_timeout = 20');
DB::statement('SET SESSION innodb_lock_wait_timeout = 20');
echo "MySQL lock wait limits: metadata=20s, innodb=20s".PHP_EOL;

$loadRouteDayIndexes = static function (): array {
    $rows = DB::select("
        SELECT
            INDEX_NAME as index_name,
            NON_UNIQUE as non_unique,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') as columns_csv
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'routes'
        GROUP BY INDEX_NAME, NON_UNIQUE
    ");

    $indexes = [];

    foreach ($rows as $row) {
        $columns = array_values(array_filter(explode(',', (string) ($row->columns_csv ?? ''))));

        if ($columns !== ['driver_id', 'route_date']) {
            continue;
        }

        $indexes[] = [
            'index_name' => (string) $row->index_name,
            'non_unique' => (int) $row->non_unique,
        ];
    }

    return $indexes;
};

$indexes = $loadRouteDayIndexes();
$uniqueIndexes = array_values(array_map(
    fn (array $index): string => $index['index_name'],
    array_filter($indexes, fn (array $index): bool => $index['non_unique'] === 0)
));
$nonUniqueIndexes = array_values(array_map(
    fn (array $index): string => $index['index_name'],
    array_filter($indexes, fn (array $index): bool => $index['non_unique'] === 1)
));

echo 'Current route day indexes: '.json_encode([
    'unique_indexes' => $uniqueIndexes,
    'non_unique_indexes' => $nonUniqueIndexes,
]).PHP_EOL;

foreach ($uniqueIndexes as $indexName) {
    echo "Dropping legacy unique index {$indexName}".PHP_EOL;
    DB::statement(sprintf(
        'ALTER TABLE `routes` DROP INDEX `%s`',
        str_replace('`', '``', $indexName)
    ));
}

if ($nonUniqueIndexes === []) {
    echo "Creating non-unique composite index routes_driver_id_route_date_index".PHP_EOL;
    DB::statement('ALTER TABLE `routes` ADD INDEX `routes_driver_id_route_date_index` (`driver_id`, `route_date`)');
}

$finalIndexes = $loadRouteDayIndexes();
$finalUniqueIndexes = array_values(array_map(
    fn (array $index): string => $index['index_name'],
    array_filter($finalIndexes, fn (array $index): bool => $index['non_unique'] === 0)
));
$finalNonUniqueIndexes = array_values(array_map(
    fn (array $index): string => $index['index_name'],
    array_filter($finalIndexes, fn (array $index): bool => $index['non_unique'] === 1)
));

echo 'Final route day indexes: '.json_encode([
    'unique_indexes' => $finalUniqueIndexes,
    'non_unique_indexes' => $finalNonUniqueIndexes,
]).PHP_EOL;

if ($finalUniqueIndexes !== [] || $finalNonUniqueIndexes === []) {
    fwrite(STDERR, "ERROR: route day index repair did not complete.\n");
    exit(1);
}

echo "OK: route day index repair complete.\n";
