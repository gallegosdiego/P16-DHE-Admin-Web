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

    public function test_admin_can_create_settlement(): void
    {
        $shipment = Shipment::where('payment_type', 'cash_on_delivery')->first();
        if (! $shipment) {
            $this->markTestSkipped('No hay shipment COD para prueba');
        }

        $shipment->update([
            'financial_status' => 'collected',
            'delivered_at' => now()->toDateString(),
        ]);

        $totalSettled = max(0, (int) $shipment->cod_amount - 1000);
        $response = $this->actingAs($this->admin, 'sanctum')->postJson('/api/cod-settlements', [
            'driver_id' => $shipment->driver_id,
            'date' => now()->toDateString(),
            'total_settled' => $totalSettled,
            'notes' => 'Cierre parcial prueba',
        ]);

        $response->assertCreated();
        $this->assertSame(
            (int) $response->json('total_collected') - (int) $response->json('total_settled'),
            (int) $response->json('difference')
        );
    }

    public function test_admin_can_close_settlement(): void
    {
        $driverId = Shipment::whereNotNull('driver_id')->value('driver_id');
        if (! $driverId) {
            $this->markTestSkipped('No hay driver_id disponible');
        }
        $settlement = CodSettlement::create([
            'driver_id' => $driverId,
            'settlement_date' => now()->toDateString(),
            'total_collected' => 20000,
            'total_settled' => 15000,
            'difference' => 5000,
            'status' => 'partial',
            'settled_by' => $this->admin->id,
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/cod-settlements/{$settlement->id}/close");

        $response->assertOk();
        $this->assertDatabaseHas('cod_settlements', ['id' => $settlement->id, 'status' => 'settled']);
    }

    public function test_cannot_close_already_settled(): void
    {
        $driverId = Shipment::whereNotNull('driver_id')->value('driver_id');
        if (! $driverId) {
            $this->markTestSkipped('No hay driver_id disponible');
        }
        $settlement = CodSettlement::create([
            'driver_id' => $driverId,
            'settlement_date' => now()->toDateString(),
            'total_collected' => 20000,
            'total_settled' => 20000,
            'difference' => 0,
            'status' => 'settled',
            'settled_by' => $this->admin->id,
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/cod-settlements/{$settlement->id}/close");

        $response->assertUnprocessable();
    }

    public function test_settlement_creates_audit_log(): void
    {
        $shipment = Shipment::where('payment_type', 'cash_on_delivery')->first();
        if (! $shipment) {
            $this->markTestSkipped('No hay shipment COD para prueba');
        }

        $shipment->update([
            'financial_status' => 'collected',
            'delivered_at' => now()->toDateString(),
        ]);

        $this->actingAs($this->admin, 'sanctum')->postJson('/api/cod-settlements', [
            'driver_id' => $shipment->driver_id,
            'date' => now()->toDateString(),
            'total_settled' => (int) $shipment->cod_amount,
        ])->assertCreated();

        $this->assertDatabaseHas('audit_logs', ['action' => 'financial.cod_settlement']);
    }

    public function test_operador_cannot_access_settlements(): void
    {
        $this->actingAs($this->operador, 'sanctum')
            ->getJson('/api/cod-settlements')
            ->assertForbidden();
    }
}
