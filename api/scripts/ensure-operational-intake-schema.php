<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__.'/../vendor/autoload.php';

$app = require_once __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

echo 'ensure-operational-intake-schema.php '.date('Y-m-d H:i:s').PHP_EOL;

$migrationPaths = [
    database_path('migrations/2026_07_16_140000_create_core_pickup_foundation.php'),
    database_path('migrations/2026_07_11_180000_create_operational_foundation_tables.php'),
];

foreach ($migrationPaths as $migrationPath) {
    if (! is_file($migrationPath)) {
        fwrite(STDERR, "ERROR: missing critical migration: {$migrationPath}".PHP_EOL);
        exit(1);
    }

    $migration = require $migrationPath;
    $migration->up();
}

if (! Schema::hasTable('idempotency_records')) {
    $idempotencyMigrationPath = database_path(
        'migrations/2026_07_11_181000_create_idempotency_records_table.php',
    );

    if (! is_file($idempotencyMigrationPath)) {
        fwrite(STDERR, "ERROR: missing critical migration: {$idempotencyMigrationPath}".PHP_EOL);
        exit(1);
    }

    $idempotencyMigration = require $idempotencyMigrationPath;
    $idempotencyMigration->up();
}

$assignedUserMigrationPath = database_path(
    'migrations/2026_07_15_100000_add_assigned_user_to_operational_tasks.php',
);

if (! is_file($assignedUserMigrationPath)) {
    fwrite(STDERR, "ERROR: missing critical migration: {$assignedUserMigrationPath}".PHP_EOL);
    exit(1);
}

$assignedUserMigration = require $assignedUserMigrationPath;
$assignedUserMigration->up();

$intakePermissionMigrationPath = database_path(
    'migrations/2026_07_15_101000_register_intake_permissions.php',
);

if (! is_file($intakePermissionMigrationPath)) {
    fwrite(STDERR, "ERROR: missing critical migration: {$intakePermissionMigrationPath}".PHP_EOL);
    exit(1);
}

$intakePermissionMigration = require $intakePermissionMigrationPath;
$intakePermissionMigration->up();

$requiredColumns = [
    'service_locations' => [
        'id',
        'code',
        'name',
        'location_type',
        'address_line1',
        'address_complement',
        'zone',
        'city',
        'lat',
        'lng',
        'timezone',
        'opening_hours_json',
        'capabilities_json',
        'contact_name',
        'contact_phone',
        'is_active',
        'created_at',
        'updated_at',
        'deleted_at',
    ],
    'pickup_requests' => [
        'id',
        'pickup_code',
        'customer_id',
        'customer_whatsapp_contact_id',
        'source',
        'intake_mode',
        'service_location_id',
        'planned_dropoff_at',
        'status',
        'review_reason_code',
        'pickup_address_line1',
        'pickup_address_complement',
        'pickup_zone',
        'pickup_city',
        'pickup_lat',
        'pickup_lng',
        'pickup_geocoding_confidence',
        'coverage_status',
        'contact_name',
        'contact_phone',
        'pickup_window_code',
        'pickup_window_label',
        'package_count',
        'requested_cod_total',
        'special_instructions',
        'correlation_id',
        'submitted_at',
        'accepted_at',
        'ready_for_assignment_at',
        'cancelled_at',
        'created_at',
        'updated_at',
    ],
    'pickup_packages' => [
        'id',
        'pickup_request_id',
        'package_index',
        'recipient_name',
        'recipient_phone',
        'delivery_address_line1',
        'delivery_address_complement',
        'delivery_zone',
        'delivery_city',
        'delivery_lat',
        'delivery_lng',
        'delivery_geocoding_confidence',
        'is_cod',
        'requested_cod_amount',
        'is_fragile',
        'package_type',
        'size_code',
        'approx_weight_kg',
        'special_handling_notes',
        'shipment_id',
        'guide_number',
        'qr_reference',
        'created_at',
        'updated_at',
    ],
    'pickup_review_events' => [
        'id',
        'pickup_request_id',
        'event_type',
        'reason_code',
        'notes',
        'requested_fields_json',
        'old_values_json',
        'new_values_json',
        'actor_type',
        'actor_id',
        'occurred_at',
        'created_at',
    ],
    'operational_tasks' => [
        'id',
        'task_code',
        'task_type',
        'status',
        'priority',
        'customer_id',
        'pickup_request_id',
        'shipment_id',
        'service_location_id',
        'assignee_type',
        'assigned_driver_id',
        'assigned_user_id',
        'assigned_executor_name',
        'assigned_executor_phone',
        'scheduled_date',
        'window_starts_at',
        'window_ends_at',
        'assigned_at',
        'accepted_at',
        'started_at',
        'completed_at',
        'cancelled_at',
        'outcome_code',
        'notes',
        'metadata_json',
        'created_by',
        'updated_by',
        'created_at',
        'updated_at',
        'deleted_at',
    ],
    'pickup_batches' => [
        'id',
        'batch_code',
        'pickup_request_id',
        'operational_task_id',
        'service_location_id',
        'driver_id',
        'intake_mode',
        'status',
        'executor_type',
        'executor_name',
        'delivered_by_name',
        'delivered_by_phone',
        'delivered_by_relationship',
        'received_by',
        'expected_packages',
        'received_packages',
        'rejected_packages',
        'missing_packages',
        'arrival_lat',
        'arrival_lng',
        'arrived_at',
        'completed_at',
        'confirmation_type',
        'confirmation_reference',
        'notes',
        'created_at',
        'updated_at',
    ],
    'pickup_batch_items' => [
        'id',
        'pickup_batch_id',
        'pickup_package_id',
        'shipment_id',
        'item_reference',
        'result',
        'physical_condition',
        'exception_code',
        'exception_notes',
        'verified_at',
        'verified_by',
        'created_at',
        'updated_at',
    ],
    'delivery_attempts' => [
        'id',
        'shipment_id',
        'operational_task_id',
        'route_stop_id',
        'driver_id',
        'attempt_number',
        'status',
        'result_code',
        'failure_cause_code',
        'started_at',
        'arrived_at',
        'finished_at',
        'lat',
        'lng',
        'recipient_name',
        'recipient_document',
        'recipient_relationship',
        'cod_expected_amount',
        'cod_collected_amount',
        'cod_payment_method',
        'custody_outcome',
        'notes',
        'metadata_json',
        'created_at',
        'updated_at',
    ],
    'shipment_evidence' => [
        'id',
        'shipment_id',
        'operational_task_id',
        'delivery_attempt_id',
        'evidence_type',
        'original_path',
        'sealed_path',
        'sha256',
        'mime_type',
        'file_size',
        'width',
        'height',
        'source',
        'lat',
        'lng',
        'captured_at',
        'received_at',
        'created_by',
        'metadata_json',
        'created_at',
        'updated_at',
    ],
    'custody_events' => [
        'id',
        'shipment_id',
        'operational_task_id',
        'shipment_evidence_id',
        'event_type',
        'previous_custodian_type',
        'previous_custodian_id',
        'previous_custodian_name',
        'new_custodian_type',
        'new_custodian_id',
        'new_custodian_name',
        'physical_condition',
        'actor_user_id',
        'lat',
        'lng',
        'occurred_at',
        'metadata_json',
        'created_at',
    ],
    'idempotency_records' => [
        'id',
        'scope',
        'idempotency_key',
        'operation',
        'request_hash',
        'status',
        'result_type',
        'result_id',
        'response_json',
        'completed_at',
        'expires_at',
        'created_at',
        'updated_at',
    ],
];

$missingTables = [];
$missingColumns = [];
$missingPermissions = [];

foreach ($requiredColumns as $table => $columns) {
    if (! Schema::hasTable($table)) {
        $missingTables[] = $table;

        continue;
    }

    $availableColumns = array_fill_keys(Schema::getColumnListing($table), true);

    foreach ($columns as $column) {
        if (! isset($availableColumns[$column])) {
            $missingColumns[] = "{$table}.{$column}";
        }
    }
}

foreach (['web', 'sanctum'] as $guard) {
    foreach ([
        'shipments.direct_create',
        'intakes.create',
        'intakes.add_package',
        'intakes.assign',
        'intakes.receive',
        'intakes.materialize',
    ] as $permission) {
        $exists = DB::table('permissions')
            ->where('name', $permission)
            ->where('guard_name', $guard)
            ->exists();

        if (! $exists) {
            $missingPermissions[] = "{$guard}:{$permission}";
        }
    }
}

if ($missingTables !== []) {
    fwrite(
        STDERR,
        'ERROR: missing operational intake tables: '.implode(', ', $missingTables).PHP_EOL,
    );
}

if ($missingColumns !== []) {
    fwrite(
        STDERR,
        'ERROR: missing operational intake columns: '.implode(', ', $missingColumns).PHP_EOL,
    );
}

if ($missingPermissions !== []) {
    fwrite(
        STDERR,
        'ERROR: missing operational intake permissions: '.implode(', ', $missingPermissions).PHP_EOL,
    );
}

if ($missingTables !== [] || $missingColumns !== [] || $missingPermissions !== []) {
    exit(1);
}

echo 'OK: operational intake schema and permissions are complete before application code copy.'.PHP_EOL;
