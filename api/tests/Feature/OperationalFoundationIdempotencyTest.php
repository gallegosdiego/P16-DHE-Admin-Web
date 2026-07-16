<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
