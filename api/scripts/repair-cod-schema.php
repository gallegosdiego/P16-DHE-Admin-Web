<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

require __DIR__.'/../vendor/autoload.php';

$app = require_once __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$requiredColumns = [
    'cod_collected_amount',
    'cod_payment_method',
    'cod_collected_at',
];

echo 'repair-cod-schema.php '.date('Y-m-d H:i:s').PHP_EOL;

if (! Schema::hasTable('shipments')) {
    fwrite(STDERR, "ERROR: table shipments does not exist.\n");
    exit(1);
}

$missingColumns = array_values(array_filter(
    $requiredColumns,
    fn (string $column): bool => ! Schema::hasColumn('shipments', $column)
));

if ($missingColumns === []) {
    echo "OK: COD collection columns already exist.\n";
    exit(0);
}

echo 'Adding missing columns: '.implode(', ', $missingColumns).PHP_EOL;

Schema::table('shipments', function (Blueprint $table) use ($missingColumns): void {
    if (in_array('cod_collected_amount', $missingColumns, true)) {
        $table->decimal('cod_collected_amount', 12, 0)->nullable();
    }

    if (in_array('cod_payment_method', $missingColumns, true)) {
        $table->string('cod_payment_method', 40)->nullable();
    }

    if (in_array('cod_collected_at', $missingColumns, true)) {
        $table->timestamp('cod_collected_at')->nullable();
    }
});

$finalState = [];

foreach ($requiredColumns as $column) {
    $finalState[$column] = Schema::hasColumn('shipments', $column);
}

echo 'COD collection schema: '.json_encode($finalState).PHP_EOL;

if (in_array(false, $finalState, true)) {
    fwrite(STDERR, "ERROR: COD schema repair did not complete.\n");
    exit(1);
}

echo "OK: COD schema repair complete.\n";
