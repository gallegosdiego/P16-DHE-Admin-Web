<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

require __DIR__.'/../vendor/autoload.php';

$app = require_once __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$requiredColumns = [
    'intake_photo',
    'recipient_lat',
    'recipient_lng',
    'geocoded_at',
];

echo 'repair-driver-mobile-geo-schema.php '.date('Y-m-d H:i:s').PHP_EOL;

if (! Schema::hasTable('shipments')) {
    fwrite(STDERR, "ERROR: table shipments does not exist.\n");
    exit(1);
}

$missingColumns = array_values(array_filter(
    $requiredColumns,
    fn (string $column): bool => ! Schema::hasColumn('shipments', $column)
));

if ($missingColumns === []) {
    echo "OK: driver/mobile geo columns already exist.\n";
} else {
    echo 'Adding missing columns: '.implode(', ', $missingColumns).PHP_EOL;

    Schema::table('shipments', function (Blueprint $table) use ($missingColumns): void {
        if (in_array('intake_photo', $missingColumns, true)) {
            $column = $table->string('intake_photo', 255)->nullable();

            if (Schema::hasColumn('shipments', 'evidence_photo')) {
                $column->after('evidence_photo');
            }
        }

        if (in_array('recipient_lat', $missingColumns, true)) {
            $column = $table->decimal('recipient_lat', 10, 7)->nullable();

            if (Schema::hasColumn('shipments', 'recipient_city')) {
                $column->after('recipient_city');
            }
        }

        if (in_array('recipient_lng', $missingColumns, true)) {
            $column = $table->decimal('recipient_lng', 10, 7)->nullable();

            if (Schema::hasColumn('shipments', 'recipient_lat')) {
                $column->after('recipient_lat');
            }
        }

        if (in_array('geocoded_at', $missingColumns, true)) {
            $column = $table->timestamp('geocoded_at')->nullable();

            if (Schema::hasColumn('shipments', 'recipient_lng')) {
                $column->after('recipient_lng');
            }
        }
    });
}

$finalState = [];

foreach ($requiredColumns as $column) {
    $finalState[$column] = Schema::hasColumn('shipments', $column);
}

echo 'Driver/mobile geo schema: '.json_encode($finalState).PHP_EOL;

if (in_array(false, $finalState, true)) {
    fwrite(STDERR, "ERROR: driver/mobile geo schema repair did not complete.\n");
    exit(1);
}

$mapsConfigured = filled(config('services.google.maps_key'));
echo 'Google Maps geocoding configured: '.($mapsConfigured ? 'yes' : 'no').PHP_EOL;

if (! $mapsConfigured) {
    echo "INFO: GOOGLE_MAPS_API_KEY is missing. Google geocoding is optional because the Nominatim fallback remains enabled.\n";
}

echo "OK: driver/mobile geo schema repair complete.\n";
