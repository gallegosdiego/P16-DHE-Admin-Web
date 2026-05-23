<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExportExtendedTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $operador;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->seed(\Database\Seeders\DemoDataSeeder::class);
        $this->seed(\Database\Seeders\FinancialDemoSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
        $this->operador = User::where('email', 'operador@danheiexpress.com')->first();
    }

    public function test_admin_can_export_receivables_csv(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')->get('/api/reports/export/receivables');

        $response->assertOk();
        $this->assertStringContainsString('text/csv', (string) $response->headers->get('Content-Type'));
        $this->assertStringContainsString('attachment; filename=', (string) $response->headers->get('Content-Disposition'));
    }

    public function test_admin_can_export_payroll_csv(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')->get('/api/reports/export/payroll');

        $response->assertOk();
        $this->assertStringContainsString('text/csv', (string) $response->headers->get('Content-Type'));
    }

    public function test_admin_can_export_expenses_csv(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')->get('/api/reports/export/expenses');

        $response->assertOk();
        $this->assertStringContainsString('text/csv', (string) $response->headers->get('Content-Type'));
    }

    public function test_admin_can_settle_client_receivables(): void
    {
        $client = Client::where('billing_type', 'post_sale')->first();
        if (! $client) {
            $this->markTestSkipped('No existe cliente post_sale en seed');
        }

        $shipment = Shipment::where('client_id', $client->id)
            ->where('payment_type', 'post_sale')
            ->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
            ->first();

        if (! $shipment) {
            $this->markTestSkipped('No hay shipment receivable para cliente post_sale');
        }

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/clients/{$client->id}/settle-receivables")
            ->assertOk();

        $this->assertDatabaseHas('shipments', [
            'id' => $shipment->id,
            'financial_status' => 'settled',
        ]);
    }

    public function test_settle_creates_audit_log(): void
    {
        $client = Client::where('billing_type', 'post_sale')->first();
        if (! $client) {
            $this->markTestSkipped('No existe cliente post_sale en seed');
        }

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/clients/{$client->id}/settle-receivables")
            ->assertOk();

        $this->assertDatabaseHas('audit_logs', ['action' => 'financial.client_settled']);
    }

    public function test_operador_cannot_settle_receivables(): void
    {
        $client = Client::first();

        $this->actingAs($this->operador, 'sanctum')
            ->postJson("/api/clients/{$client->id}/settle-receivables")
            ->assertForbidden();
    }
}
