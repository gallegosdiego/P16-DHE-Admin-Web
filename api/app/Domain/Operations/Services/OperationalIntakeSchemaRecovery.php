<?php

namespace App\Domain\Operations\Services;

use RuntimeException;

final class OperationalIntakeSchemaRecovery
{
    public function __construct(
        private readonly OperationalIntakeSchema $schema,
    ) {}

    /**
     * Reapplies the idempotent intake foundation after Laravel migrations.
     *
     * cPanel can report a migration as executed while a previous interrupted
     * deployment left only part of the operational schema. These recovery
     * calls rebuild missing tables, columns and permissions without deleting
     * operational data.
     *
     * @return array{
     *     tables: array<string, bool>,
     *     columns: array<string, array<string, bool>>,
     *     ready: bool
     * }
     */
    public function recover(): array
    {
        $this->runMigration('2026_07_16_140000_create_core_pickup_foundation.php');
        $this->runMigration('2026_07_11_180000_create_operational_foundation_tables.php');
        $this->runMigration('2026_07_29_110000_create_pickup_batch_item_evidence_table.php');

        $state = $this->schema->inspect();
        if (! ($state['tables']['idempotency_records'] ?? false)) {
            $this->runMigration('2026_07_11_181000_create_idempotency_records_table.php');
        }

        $this->runMigration('2026_07_15_100000_add_assigned_user_to_operational_tasks.php');
        $this->runMigration('2026_07_15_101000_register_intake_permissions.php');

        $state = $this->schema->inspect();
        $this->schema->ensureReady();

        return $state;
    }

    private function runMigration(string $filename): void
    {
        $path = database_path('migrations/'.$filename);
        if (! is_file($path)) {
            throw new RuntimeException("Missing operational migration: {$filename}");
        }

        $migration = require $path;
        if (! is_object($migration) || ! method_exists($migration, 'up')) {
            throw new RuntimeException("Invalid operational migration: {$filename}");
        }

        $migration->up();
    }
}
