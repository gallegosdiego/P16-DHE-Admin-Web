<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->seed(\Database\Seeders\DemoDataSeeder::class);
    }

    public function test_superadmin_can_export_shipments_csv(): void
    {
        $user = User::whereHas('roles', fn ($q) => $q->where('name', 'superadmin'))->first();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/exports/shipments');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');
        $response->assertHeader('content-disposition');

        // CSV should contain header row
        $content = $response->getContent();
        $this->assertStringContainsString('Guia', $content);
        $this->assertStringContainsString('Estado', $content);
        $this->assertStringContainsString('Destinatario', $content);
    }

    public function test_export_csv_contains_shipment_data(): void
    {
        $user = User::whereHas('roles', fn ($q) => $q->where('name', 'superadmin'))->first();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/exports/shipments');

        $content = $response->getContent();
        // Demo seeder creates shipments with DHE codes
        $this->assertStringContainsString('DHE', $content);
    }

    public function test_export_respects_status_filter(): void
    {
        $user = User::whereHas('roles', fn ($q) => $q->where('name', 'superadmin'))->first();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/exports/shipments?status=delivered');

        $response->assertOk();
    }

    public function test_operador_cannot_export_without_permission(): void
    {
        $user = User::whereHas('roles', fn ($q) => $q->where('name', 'operador'))->first();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/exports/shipments');

        $response->assertForbidden();
    }

    public function test_unauthenticated_cannot_export(): void
    {
        $response = $this->getJson('/api/exports/shipments');
        $response->assertUnauthorized();
    }
}
