<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class RbacTest extends TestCase
{
    use RefreshDatabase;

    private User $operador;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->seed(\Database\Seeders\DemoDataSeeder::class);

        // Usar el operador creado por el seeder
        $this->operador = User::where('email', 'operador@danheiexpress.com')->first();
    }

    public function test_operador_can_view_shipments(): void
    {
        $response = $this->actingAs($this->operador, 'sanctum')
            ->getJson('/api/shipments');

        $response->assertOk();
    }

    public function test_operador_can_create_shipments(): void
    {
        $response = $this->actingAs($this->operador, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => 1,
                'recipient_name' => 'Test',
                'recipient_phone' => '311 000 0000',
                'recipient_address' => 'Calle 22 #10-54',
                'recipient_city' => 'Bogota',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 10000,
            ]);

        $response->assertCreated();
    }

    public function test_operador_cannot_access_financial_overview(): void
    {
        $response = $this->actingAs($this->operador, 'sanctum')
            ->getJson('/api/financial/overview');

        $response->assertForbidden()
            ->assertJsonPath('error', 'No tienes permiso para esta acción.');
    }

    public function test_operador_cannot_access_expenses(): void
    {
        $response = $this->actingAs($this->operador, 'sanctum')
            ->getJson('/api/expenses');

        $response->assertForbidden();
    }

    public function test_operador_cannot_access_payroll(): void
    {
        $response = $this->actingAs($this->operador, 'sanctum')
            ->getJson('/api/employees');

        $response->assertForbidden();
    }

    public function test_superadmin_can_access_everything(): void
    {
        $admin = User::where('email', 'admin@danheiexpress.com')->first();

        // Financiero
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/financial/overview')
            ->assertOk();

        // Gastos
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/expenses')
            ->assertOk();

        // Nómina
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/employees')
            ->assertOk();
    }
}
