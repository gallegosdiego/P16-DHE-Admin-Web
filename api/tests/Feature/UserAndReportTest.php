<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserAndReportTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $operador;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->seed(\Database\Seeders\DemoDataSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
        $this->operador = User::where('email', 'operador@danheiexpress.com')->first();
    }

    // ── Users ──────────────────────────────────

    public function test_admin_can_list_users(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/users');

        $response->assertOk()
            ->assertJsonStructure(['data' => [['id', 'name', 'email']]]);

        $this->assertGreaterThanOrEqual(3, $response->json('total'));
    }

    public function test_admin_can_create_user(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/users', [
                'name' => 'Nuevo User',
                'email' => 'nuevo@test.com',
                'password' => 'Password123!',
                'role' => 'operador',
            ]);

        $response->assertCreated()
            ->assertJsonPath('name', 'Nuevo User');
    }

    public function test_operador_cannot_list_users(): void
    {
        $response = $this->actingAs($this->operador, 'sanctum')
            ->getJson('/api/users');

        $response->assertForbidden();
    }

    public function test_can_list_roles(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/roles');

        $response->assertOk();
        $this->assertGreaterThanOrEqual(5, count($response->json()));
    }

    // ── Reports ──────────────────────────────────

    public function test_admin_can_get_report_stats(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/reports/stats');

        $response->assertOk()
            ->assertJsonStructure([
                'period' => ['from', 'to'],
                'summary' => ['total', 'delivered', 'delivery_rate', 'revenue', 'profit'],
                'by_status',
                'by_driver',
                'by_client',
            ]);
    }

    public function test_admin_can_export_shipments_csv(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->get('/api/reports/export/shipments');

        $response->assertOk();
        $this->assertStringContainsString('text/csv', $response->headers->get('Content-Type'));
        $this->assertStringContainsString('Guía', $response->getContent());
    }

    public function test_admin_can_export_financial_csv(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->get('/api/reports/export/financial');

        $response->assertOk();
        $this->assertStringContainsString('text/csv', $response->headers->get('Content-Type'));
        $this->assertStringContainsString('Conductor', $response->getContent());
    }

    public function test_admin_can_get_driver_board_with_action_shipment_ids(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/financial/driver-board');

        $response->assertOk();
        $response->assertJsonStructure([
            '*' => [
                'id',
                'name',
                'cod_pending',
                'cod_collected',
                'unpaid_fees',
                'today_deliveries',
                'collect_shipment_id',
                'settle_shipment_id',
                'driver_paid_shipment_id',
            ],
        ]);
    }

    // ── Addresses ──────────────────────────────────

    public function test_admin_can_add_client_address(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/clients/1/addresses', [
                'address' => 'Cl Test #99-99',
                'zone' => 'Test Zone',
                'label' => 'Oficina',
            ]);

        $response->assertCreated()
            ->assertJsonPath('address', 'Cl Test #99-99');
    }

    public function test_admin_can_delete_client_address(): void
    {
        // Primero crear una
        $res = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/clients/1/addresses', [
                'address' => 'Temp Address',
            ]);

        $id = $res->json('id');

        $response = $this->actingAs($this->admin, 'sanctum')
            ->deleteJson("/api/client-addresses/{$id}");

        $response->assertOk()
            ->assertJsonPath('message', 'Dirección eliminada.');
    }
}
