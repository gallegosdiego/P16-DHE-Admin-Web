<?php

namespace Tests\Feature;

use App\Domain\Financial\Models\CodSettlement;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CodSettlementTest extends TestCase
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

    public function test_admin_can_list_settlements(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')->getJson('/api/cod-settlements');

        $response->assertOk()->assertJsonStructure(['data', 'current_page', 'last_page', 'total']);
    }

    public function test_admin_can_get_daily_summary(): void
    {
        $date = now()->toDateString();
        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/cod-settlements/daily-summary?date={$date}");

        $response->assertOk()->assertJsonStructure(['date', 'drivers', 'totals']);
    }

    public function test_create_settlement_is_retired_with_410(): void
    {
        $shipment = Shipment::where('payment_type', 'cash_on_delivery')->whereNotNull('driver_id')->firstOrFail();
        $shipment->update(['financial_status' => 'collected']);
        $before = CodSettlement::count();

        $this->actingAs($this->admin, 'sanctum')->postJson('/api/cod-settlements', [
            'driver_id' => $shipment->driver_id,
            'date' => now()->toDateString(),
            'total_settled' => (int) $shipment->cod_amount,
        ])
            ->assertStatus(410)
            ->assertJsonPath('message', 'Esta acción se retiró. Usa Pagos → Conciliación.');

        $this->assertSame($before, CodSettlement::count());
        $this->assertSame('collected', $shipment->fresh()->getRawOriginal('financial_status'));
        $this->assertDatabaseMissing('audit_logs', ['action' => 'financial.cod_settlement']);
    }

    public function test_close_settlement_is_retired_with_410(): void
    {
        $driverId = Shipment::whereNotNull('driver_id')->value('driver_id');
        $settlement = CodSettlement::create([
            'driver_id' => $driverId,
            'settlement_date' => now()->toDateString(),
            'total_collected' => 20000,
            'total_settled' => 15000,
            'difference' => 5000,
            'status' => 'partial',
            'settled_by' => $this->admin->id,
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/cod-settlements/{$settlement->id}/close")
            ->assertStatus(410);

        $this->assertDatabaseHas('cod_settlements', ['id' => $settlement->id, 'status' => 'partial']);
    }

    public function test_operador_still_cannot_call_retired_settlement_write(): void
    {
        $this->actingAs($this->operador, 'sanctum')
            ->postJson('/api/cod-settlements', [])
            ->assertForbidden();
    }

    public function test_operador_cannot_access_settlements(): void
    {
        $this->actingAs($this->operador, 'sanctum')
            ->getJson('/api/cod-settlements')
            ->assertForbidden();
    }
}
