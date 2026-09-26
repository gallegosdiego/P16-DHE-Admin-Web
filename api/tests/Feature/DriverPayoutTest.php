<?php

namespace Tests\Feature;

use App\Domain\Financial\Models\DriverPayout;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DriverPayoutTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->seed(\Database\Seeders\DemoDataSeeder::class);
        $this->seed(\Database\Seeders\FinancialDemoSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
    }

    public function test_admin_can_list_payouts(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/driver-payouts')
            ->assertOk()
            ->assertJsonStructure(['data', 'current_page', 'last_page', 'total']);
    }

    public function test_admin_can_get_pending_payouts(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/driver-payouts/pending')
            ->assertOk()
            ->assertJsonStructure(['date', 'drivers', 'total_pending']);
    }

    public function test_generate_payout_is_retired_with_410(): void
    {
        $shipment = Shipment::whereNotNull('driver_id')->firstOrFail();
        $shipment->update(['status' => 'delivered', 'delivered_at' => now(), 'driver_paid' => false]);
        $before = DriverPayout::count();

        $this->actingAs($this->admin, 'sanctum')->postJson('/api/driver-payouts/generate', [
            'driver_id' => $shipment->driver_id,
            'date' => now()->toDateString(),
        ])
            ->assertStatus(410)
            ->assertJsonPath('message', 'Esta acción se retiró. Usa Pagos → Conciliación.');

        $this->assertSame($before, DriverPayout::count());
        $this->assertDatabaseMissing('audit_logs', ['action' => 'financial.payout_generated']);
    }

    public function test_mark_payout_paid_is_retired_and_never_sets_driver_paid(): void
    {
        $shipment = Shipment::whereNotNull('driver_id')->firstOrFail();
        $shipment->update(['status' => 'delivered', 'driver_paid' => false]);
        $payout = DriverPayout::create([
            'driver_id' => $shipment->driver_id,
            'payout_date' => now()->toDateString(),
            'packages_count' => 1,
            'total_amount' => 10000,
            'status' => 'pending',
        ]);
        $shipment->forceFill(['payout_id' => $payout->id])->save();

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/driver-payouts/{$payout->id}/pay")
            ->assertStatus(410);

        $this->assertDatabaseHas('driver_payouts', ['id' => $payout->id, 'status' => 'pending']);
        $this->assertDatabaseHas('shipments', ['id' => $shipment->id, 'driver_paid' => false]);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'financial.payout_paid']);
    }
}
