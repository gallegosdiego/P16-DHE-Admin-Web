<?php

namespace Tests\Feature;

use App\Domain\Operations\Services\OperationalIntakeSchemaRecovery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class OperationalFoundationIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_core_pickup_foundation_recovers_from_service_location_only_state(): void
    {
        Schema::disableForeignKeyConstraints();
        Schema::dropIfExists('pickup_review_events');
        Schema::dropIfExists('pickup_packages');
        Schema::dropIfExists('pickup_requests');
        Schema::enableForeignKeyConstraints();

        $coreFoundation = require database_path('migrations/2026_07_16_140000_create_core_pickup_foundation.php');

        $coreFoundation->up();
        $coreFoundation->up();

        $this->assertTrue(Schema::hasTable('service_locations'));
        $this->assertTrue(Schema::hasTable('pickup_requests'));
        $this->assertTrue(Schema::hasTable('pickup_packages'));
        $this->assertTrue(Schema::hasTable('pickup_review_events'));
        $this->assertTrue(Schema::hasColumn('pickup_requests', 'intake_mode'));
        $this->assertTrue(Schema::hasColumn('pickup_requests', 'service_location_id'));
        $this->assertTrue(Schema::hasColumn('pickup_packages', 'shipment_id'));
    }

    public function test_foundation_migrations_can_resume_when_tables_already_exist(): void
    {
        $pickupFoundation = require database_path('migrations/2026_07_07_130000_create_whatsapp_pickup_foundation_tables.php');
        $operationalFoundation = require database_path('migrations/2026_07_11_180000_create_operational_foundation_tables.php');
        $assignedUser = require database_path('migrations/2026_07_15_100000_add_assigned_user_to_operational_tasks.php');

        $pickupFoundation->up();
        $operationalFoundation->up();
        $assignedUser->up();

        $this->assertTrue(Schema::hasTable('pickup_requests'));
        $this->assertTrue(Schema::hasTable('pickup_packages'));
        $this->assertTrue(Schema::hasTable('operational_tasks'));
        $this->assertTrue(Schema::hasTable('pickup_batches'));
        $this->assertTrue(Schema::hasTable('custody_events'));
        $this->assertTrue(Schema::hasColumn('operational_tasks', 'assigned_user_id'));
    }

    public function test_reconciliation_migration_recovers_when_ledger_table_already_exists(): void
    {
        $ledgerTables = [
            'driver_cod_remittance_allocations',
            'driver_cod_remittances',
            'driver_service_payment_allocations',
            'driver_service_payments',
            'client_cod_payout_allocations',
            'client_cod_payouts',
            'client_cod_entitlements',
            'payment_intents',
            'driver_service_earnings',
        ];

        Schema::disableForeignKeyConstraints();
        try {
            foreach ($ledgerTables as $table) {
                Schema::dropIfExists($table);
            }
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        $migration = require database_path('migrations/2026_07_12_150000_create_reconciliation_ledgers.php');

        $migration->up();
        $migration->up();

        foreach (array_merge(['driver_cod_obligations'], $ledgerTables) as $table) {
            $this->assertTrue(Schema::hasTable($table), "Missing recovered table {$table}");
        }
    }

    public function test_financial_migrations_can_be_retried_after_schema_already_exists(): void
    {
        $rateRules = require database_path('migrations/2026_07_16_120000_create_financial_rate_rules.php');
        $opening = require database_path('migrations/2026_07_16_130000_add_financial_receipts_reversals_and_opening.php');
        $clientPaymentTypes = require database_path('migrations/2026_07_29_120000_create_client_payment_types_table.php');

        $rateRules->up();
        $rateRules->up();
        $opening->up();
        $opening->up();
        $clientPaymentTypes->up();
        $clientPaymentTypes->up();

        $this->assertTrue(Schema::hasTable('financial_rate_rules'));
        $this->assertTrue(Schema::hasTable('financial_opening_entries'));
        $this->assertTrue(Schema::hasTable('client_payment_types'));
        foreach ([
            'rate_rule_id',
            'standard_amount',
            'rate_snapshot_json',
            'opening_entry_id',
        ] as $column) {
            $this->assertTrue(
                Schema::hasColumn('driver_service_earnings', $column),
                "Missing financial column {$column}",
            );
        }
        $this->assertTrue(Schema::hasColumn('driver_cod_obligations', 'opening_entry_id'));
        $this->assertTrue(Schema::hasColumn('client_cod_entitlements', 'opening_entry_id'));
    }

    public function test_whatsapp_foundation_uses_mysql_safe_identifier_names(): void
    {
        $migration = file_get_contents(
            database_path('migrations/2026_07_07_130000_create_whatsapp_pickup_foundation_tables.php'),
        );

        $this->assertIsString($migration);
        foreach ([
            'cw_contacts_customer_contact_unique',
            'cw_contact_permission_contact_fk',
        ] as $identifier) {
            $this->assertLessThanOrEqual(64, strlen($identifier));
            $this->assertStringContainsString($identifier, $migration);
        }
    }

    public function test_intake_permission_repair_recovers_deleted_rows(): void
    {
        $permissions = [
            'shipments.direct_create',
            'intakes.create',
            'intakes.add_package',
            'intakes.assign',
            'intakes.receive',
            'intakes.materialize',
        ];

        DB::table('permissions')
            ->whereIn('name', $permissions)
            ->delete();

        $permissionRepair = require database_path(
            'migrations/2026_07_15_101000_register_intake_permissions.php',
        );
        $permissionRepair->up();

        foreach (['web', 'sanctum'] as $guard) {
            foreach ($permissions as $permission) {
                $this->assertDatabaseHas('permissions', [
                    'name' => $permission,
                    'guard_name' => $guard,
                ]);
            }
        }
    }

    public function test_cpanel_recovery_restores_an_interrupted_intake_schema(): void
    {
        Schema::dropIfExists('idempotency_records');

        DB::table('permissions')
            ->whereIn('name', ['intakes.create', 'intakes.receive'])
            ->delete();

        $state = app(OperationalIntakeSchemaRecovery::class)->recover();

        $this->assertTrue($state['ready']);
        $this->assertTrue(Schema::hasTable('idempotency_records'));
        $this->assertTrue(Schema::hasColumn('operational_tasks', 'assigned_user_id'));

        foreach (['web', 'sanctum'] as $guard) {
            foreach (['intakes.create', 'intakes.receive'] as $permission) {
                $this->assertDatabaseHas('permissions', [
                    'name' => $permission,
                    'guard_name' => $guard,
                ]);
            }
        }
    }
}
