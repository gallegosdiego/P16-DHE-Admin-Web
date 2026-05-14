<?php

namespace Tests\Feature;

use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinancialEdgeCaseTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
        $response = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ]);
        $this->token = $response->json('token');
    }

    private function auth(): array
    {
        return ['Authorization' => "Bearer {$this->token}"];
    }

    // ── Validaciones de tipo de pago ─────────────

    public function test_cannot_collect_non_cod_shipment(): void
    {
        $postSale = Shipment::where('payment_type', 'post_sale')->first();
        $this->assertNotNull($postSale, 'Necesita al menos un envío post_sale en seed');

        $response = $this->postJson(
            "/api/financial/shipments/{$postSale->id}/collect",
            [],
            $this->auth()
        );

        $response->assertUnprocessable();
        $this->assertStringContainsString('contra entrega', $response->json('error'));
    }

    // ── Audit trail de operaciones financieras ───

    public function test_collect_creates_audit_log(): void
    {
        $cod = Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'pending')
            ->first();

        if (! $cod) {
            $this->markTestSkipped('No hay envíos COD pending en seed');
        }

        $this->postJson(
            "/api/financial/shipments/{$cod->id}/collect",
            [],
            $this->auth()
        )->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'financial.collect',
        ]);
    }

    public function test_settle_creates_audit_log(): void
    {
        // Primero recaudar, luego liquidar
        $cod = Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'pending')
            ->first();

        if (! $cod) {
            $this->markTestSkipped('No hay envíos COD pending en seed');
        }

        // Paso 1: recaudar
        $this->postJson(
            "/api/financial/shipments/{$cod->id}/collect",
            [],
            $this->auth()
        )->assertOk();

        // Paso 2: liquidar
        $this->postJson(
            "/api/financial/shipments/{$cod->id}/settle",
            [],
            $this->auth()
        )->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'financial.settle',
        ]);
    }

    public function test_driver_paid_creates_audit_log(): void
    {
        $delivered = Shipment::where('status', 'delivered')
            ->where('driver_paid', false)
            ->first();

        if (! $delivered) {
            $this->markTestSkipped('No hay envíos delivered con driver_paid=false');
        }

        $this->postJson(
            "/api/financial/shipments/{$delivered->id}/driver-paid",
            [],
            $this->auth()
        )->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'financial.driver_paid',
        ]);
    }

    // ── Financial overview ───────────────────────

    public function test_financial_overview_returns_correct_structure(): void
    {
        $response = $this->getJson('/api/financial/overview', $this->auth());
        $response->assertOk();
        $response->assertJsonStructure([
            'cod' => ['pending', 'collected', 'settled'],
            'post_sale' => ['pending', 'invoiced', 'overdue', 'total_receivable'],
            'drivers' => ['pending_payment'],
            'totals' => ['total_receivable', 'total_payable'],
        ]);

        // Verificar que los totales son coherentes
        $data = $response->json();
        $codTotal = $data['cod']['pending'] + $data['cod']['collected'];
        $postTotal = $data['post_sale']['pending'] + $data['post_sale']['invoiced'] + $data['post_sale']['overdue'];
        $this->assertEquals(
            $data['totals']['total_receivable'],
            $codTotal + $postTotal
        );
    }

    public function test_financial_overview_values_are_integers(): void
    {
        $response = $this->getJson('/api/financial/overview', $this->auth());
        $data = $response->json();

        $this->assertIsInt($data['cod']['pending']);
        $this->assertIsInt($data['cod']['collected']);
        $this->assertIsInt($data['post_sale']['pending']);
        $this->assertIsInt($data['drivers']['pending_payment']);
    }

    // ── Driver board ─────────────────────────────

    public function test_driver_board_shows_active_drivers(): void
    {
        $response = $this->getJson('/api/financial/driver-board', $this->auth());
        $response->assertOk();

        $drivers = $response->json();
        $this->assertGreaterThanOrEqual(1, count($drivers));

        // Verificar que NO incluye drivers inactivos
        foreach ($drivers as $driver) {
            $this->assertNotEquals('inactive', $driver['status']);
        }
    }

    public function test_driver_board_has_action_shipment_ids(): void
    {
        $response = $this->getJson('/api/financial/driver-board', $this->auth());
        $drivers = $response->json();

        // Al menos un driver debe tener algún campo de acción
        $first = $drivers[0] ?? null;
        $this->assertNotNull($first);
        $this->assertArrayHasKey('collect_shipment_id', $first);
        $this->assertArrayHasKey('settle_shipment_id', $first);
        $this->assertArrayHasKey('driver_paid_shipment_id', $first);
    }

    // ── Settle batch ─────────────────────────────

    public function test_settle_batch_updates_multiple(): void
    {
        $ids = Shipment::where('payment_type', 'cash_on_delivery')
            ->whereIn('financial_status', ['pending', 'collected'])
            ->take(2)
            ->pluck('id')
            ->toArray();

        if (count($ids) < 2) {
            $this->markTestSkipped('Necesita al menos 2 envíos COD para batch');
        }

        $response = $this->postJson('/api/financial/settle-batch', [
            'shipment_ids' => $ids,
        ], $this->auth());

        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, $response->json('count'));
    }

    public function test_settle_batch_rejects_empty_array(): void
    {
        $response = $this->postJson('/api/financial/settle-batch', [
            'shipment_ids' => [],
        ], $this->auth());

        $response->assertUnprocessable();
    }

    public function test_settle_batch_rejects_invalid_ids(): void
    {
        $response = $this->postJson('/api/financial/settle-batch', [
            'shipment_ids' => [999999, 888888],
        ], $this->auth());

        $response->assertUnprocessable();
    }

}
