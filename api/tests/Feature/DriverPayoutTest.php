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

    public function test_admin_can_generate_payout(): void
    {
        $shipment = Shipment::where('status', 'delivered')->where('driver_paid', false)->first();
        if (! $shipment) {
            $this->markTestSkipped('No hay shipments delivered sin pagar');
        }

        $shipment->update(['delivered_at' => now()->toDateString()]);

        $response = $this->actingAs($this->admin, 'sanctum')->postJson('/api/driver-payouts/generate', [
            'driver_id' => $shipment->driver_id,
            'date' => now()->toDateString(),
        ]);

        $response->assertCreated();
        $this->assertGreaterThanOrEqual(1, $response->json('packages_count'));
        $this->assertGreaterThanOrEqual(0, $response->json('total_amount'));
    }

    public function test_cannot_generate_duplicate_payout(): void
    {
        $shipment = Shipment::where('status', 'delivered')->where('driver_paid', false)->first();
        if (! $shipment) {
            $this->markTestSkipped('No hay shipments delivered sin pagar');
        }

        $shipment->update(['delivered_at' => now()->toDateString()]);
        $payload = ['driver_id' => $shipment->driver_id, 'date' => now()->toDateString()];

        $this->actingAs($this->admin, 'sanctum')->postJson('/api/driver-payouts/generate', $payload);
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/driver-payouts/generate', $payload)->assertUnprocessable();
    }

    public function test_admin_can_mark_payout_paid(): void
    {
        $shipment = Shipment::where('status', 'delivered')->where('driver_paid', false)->first();
        if (! $shipment) {
            $this->markTestSkipped('No hay shipments delivered sin pagar');
        }

        $shipment->update(['delivered_at' => now()->toDateString()]);

        $generate = $this->actingAs($this->admin, 'sanctum')->postJson('/api/driver-payouts/generate', [
            'driver_id' => $shipment->driver_id,
            'date' => now()->toDateString(),
        ])->assertCreated();

        $payoutId = $generate->json('id');

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/driver-payouts/{$payoutId}/pay")
            ->assertOk();

        $this->assertDatabaseHas('shipments', ['id' => $shipment->id, 'driver_paid' => true]);
    }

    public function test_cannot_pay_already_paid_payout(): void
    {
        $driverId = Shipment::whereNotNull('driver_id')->value('driver_id');
        if (! $driverId) {
            $this->markTestSkipped('No hay driver_id disponible');
        }
        $payout = DriverPayout::create([
            'driver_id' => $driverId,
            'payout_date' => now()->toDateString(),
            'packages_count' => 1,
            'total_amount' => 10000,
            'status' => 'paid',
            'paid_at' => now()->toDateString(),
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/driver-payouts/{$payout->id}/pay")
            ->assertUnprocessable();
    }

    public function test_payout_creates_audit_log(): void
    {
        $shipment = Shipment::where('status', 'delivered')->where('driver_paid', false)->first();
        if (! $shipment) {
            $this->markTestSkipped('No hay shipments delivered sin pagar');
        }

        $shipment->update(['delivered_at' => now()->toDateString()]);

        $generate = $this->actingAs($this->admin, 'sanctum')->postJson('/api/driver-payouts/generate', [
            'driver_id' => $shipment->driver_id,
            'date' => now()->toDateString(),
        ])->assertCreated();

        $payoutId = $generate->json('id');
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/driver-payouts/{$payoutId}/pay")->assertOk();

        $this->assertDatabaseHas('audit_logs', ['action' => 'financial.payout_generated']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'financial.payout_paid']);
    }

    public function test_generate_with_no_shipments_fails(): void
    {
        $driverId = Shipment::whereNotNull('driver_id')->value('driver_id');
        if (! $driverId) {
            $this->markTestSkipped('No hay conductores asignados en shipments');
        }

        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/driver-payouts/generate', [
                'driver_id' => $driverId,
                'date' => '2099-01-01',
            ])
            ->assertUnprocessable();
    }
}
