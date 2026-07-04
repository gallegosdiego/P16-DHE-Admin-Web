<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

require __DIR__.'/../vendor/autoload.php';

$app = require_once __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$documentColumns = [
    'driver_license_photo',
    'vehicle_registration_photo',
    'soat_photo',
    'technical_inspection_photo',
    'national_id_front_photo',
    'national_id_back_photo',
];

$expiryColumns = [
    'driver_license_expires_at',
    'soat_expires_at',
    'technical_inspection_expires_at',
];

echo 'repair-driver-documents-schema.php '.date('Y-m-d H:i:s').PHP_EOL;

if (! Schema::hasTable('drivers')) {
    fwrite(STDERR, "ERROR: table drivers does not exist.\n");
    exit(1);
}

$missingDocumentColumns = array_values(array_filter(
    $documentColumns,
    fn (string $column): bool => ! Schema::hasColumn('drivers', $column)
));

$missingExpiryColumns = array_values(array_filter(
    $expiryColumns,
    fn (string $column): bool => ! Schema::hasColumn('drivers', $column)
));

if ($missingDocumentColumns !== []) {
    echo 'Adding missing driver document columns: '.implode(', ', $missingDocumentColumns).PHP_EOL;

    Schema::table('drivers', function (Blueprint $table) use ($missingDocumentColumns): void {
        if (in_array('driver_license_photo', $missingDocumentColumns, true)) {
            $column = $table->string('driver_license_photo')->nullable();

            if (Schema::hasColumn('drivers', 'zone')) {
                $column->after('zone');
            }
        }

        if (in_array('vehicle_registration_photo', $missingDocumentColumns, true)) {
            $column = $table->string('vehicle_registration_photo')->nullable();

            if (Schema::hasColumn('drivers', 'driver_license_photo')) {
                $column->after('driver_license_photo');
            }
        }

        if (in_array('soat_photo', $missingDocumentColumns, true)) {
            $column = $table->string('soat_photo')->nullable();

            if (Schema::hasColumn('drivers', 'vehicle_registration_photo')) {
                $column->after('vehicle_registration_photo');
            }
        }

        if (in_array('technical_inspection_photo', $missingDocumentColumns, true)) {
            $column = $table->string('technical_inspection_photo')->nullable();

            if (Schema::hasColumn('drivers', 'soat_photo')) {
                $column->after('soat_photo');
            }
        }

        if (in_array('national_id_front_photo', $missingDocumentColumns, true)) {
            $column = $table->string('national_id_front_photo')->nullable();

            if (Schema::hasColumn('drivers', 'technical_inspection_photo')) {
                $column->after('technical_inspection_photo');
            }
        }

        if (in_array('national_id_back_photo', $missingDocumentColumns, true)) {
            $column = $table->string('national_id_back_photo')->nullable();

            if (Schema::hasColumn('drivers', 'national_id_front_photo')) {
                $column->after('national_id_front_photo');
            }
        }
    });
} else {
    echo "OK: driver document photo columns already exist.\n";
}

if ($missingExpiryColumns !== []) {
    echo 'Adding missing driver document expiry columns: '.implode(', ', $missingExpiryColumns).PHP_EOL;

    Schema::table('drivers', function (Blueprint $table) use ($missingExpiryColumns): void {
        if (in_array('driver_license_expires_at', $missingExpiryColumns, true)) {
            $column = $table->date('driver_license_expires_at')->nullable();

            if (Schema::hasColumn('drivers', 'driver_license_photo')) {
                $column->after('driver_license_photo');
            }
        }

        if (in_array('soat_expires_at', $missingExpiryColumns, true)) {
            $column = $table->date('soat_expires_at')->nullable();

            if (Schema::hasColumn('drivers', 'soat_photo')) {
                $column->after('soat_photo');
            }
        }

        if (in_array('technical_inspection_expires_at', $missingExpiryColumns, true)) {
            $column = $table->date('technical_inspection_expires_at')->nullable();

            if (Schema::hasColumn('drivers', 'technical_inspection_photo')) {
                $column->after('technical_inspection_photo');
            }
        }
    });
} else {
    echo "OK: driver document expiry columns already exist.\n";
}

$finalState = [];

foreach (array_merge($documentColumns, $expiryColumns) as $column) {
    $finalState[$column] = Schema::hasColumn('drivers', $column);
}

echo 'Driver documents schema: '.json_encode($finalState).PHP_EOL;

if (in_array(false, $finalState, true)) {
    fwrite(STDERR, "ERROR: driver documents schema repair did not complete.\n");
    exit(1);
}

echo "OK: driver documents schema repair complete.\n";
