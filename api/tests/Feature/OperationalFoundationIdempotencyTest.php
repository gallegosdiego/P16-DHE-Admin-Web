<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class OperationalFoundationIdempotencyTest extends TestCase
{
    use RefreshDatabase;

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
}
