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

    // ── Escrituras retiradas (sep-2026): el dinero de pilotos va por el libro ──

    public function test_retired_shipment_money_writes_answer_410_without_touching_the_shipment(): void
    {
        $cod = Shipment::where('payment_type', 'cash_on_delivery')->firstOrFail();
        $cod->update(['financial_status' => 'pending', 'status' => 'delivered', 'driver_paid' => false]);

        foreach (['collect', 'settle', 'driver-paid'] as $action) {
            $this->postJson("/api/financial/shipments/{$cod->id}/{$action}", [], $this->auth())
                ->assertStatus(410)
                ->assertJsonPath('message', 'Esta acción se retiró. Usa Pagos → Conciliación.');
        }

        $fresh = $cod->fresh();
        $this->assertSame('pending', $fresh->getRawOriginal('financial_status'));
        $this->assertFalse((bool) $fresh->driver_paid);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'financial.collect']);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'financial.settle']);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'financial.driver_paid']);
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

    // ── Settle batch (retirado) ──────────────────

    public function test_settle_batch_is_retired_with_410(): void
    {
        $ids = Shipment::where('payment_type', 'cash_on_delivery')->take(2)->pluck('id')->toArray();
        Shipment::whereIn('id', $ids)->update(['financial_status' => 'collected']);

        $this->postJson('/api/financial/settle-batch', ['shipment_ids' => $ids], $this->auth())
            ->assertStatus(410);

        $this->assertSame(0, Shipment::whereIn('id', $ids)->where('financial_status', 'settled')->count());
    }
}
