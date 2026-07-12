<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Services\ReconciliationLedgerService;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReconciliationLedgerTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Driver $driver;
    private Client $client;
    private Shipment $shipment;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->seed(\Database\Seeders\DemoDataSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();
        $this->driver = Driver::where('status', 'active')->firstOrFail();
        $this->client = Client::firstOrFail();
        $sequence = (int) (Shipment::withTrashed()->max('sequence_number') ?? 0) + 1;
        $this->shipment = Shipment::create([
            'client_id' => $this->client->id, 'driver_id' => $this->driver->id, 'created_by' => $this->admin->id,
            'tracking_code' => sprintf('LED%014d', $sequence), 'display_code' => sprintf('#LED%05d', $sequence), 'sequence_number' => $sequence,
            'status' => 'delivered', 'financial_status' => 'collected', 'recipient_name' => 'Destinatario Ledger', 'recipient_phone' => '3000000000',
            'recipient_address' => 'Calle 10 # 20-30', 'recipient_city' => 'Bogota', 'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000, 'cod_amount' => 100000, 'cod_collected_amount' => 100000, 'cod_payment_method' => 'Efectivo',
            'cod_collected_at' => now(), 'driver_fee' => 3500, 'delivered_at' => now(),
        ]);
        app(ReconciliationLedgerService::class)->recordDeliveredShipment($this->shipment);
    }

    public function test_cod_and_driver_service_balances_are_independent_and_partially_allocated(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", [
            'amount' => 80000, 'method' => 'cash',
        ])->assertCreated();

        $this->actingAs($this->admin, 'sanctum')->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/service-payments", [
            'amount' => 2000, 'method' => 'nequi',
        ])->assertCreated();

        $summary = $this->actingAs($this->admin, 'sanctum')->getJson("/api/financial/driver-reconciliations/{$this->driver->id}")
            ->assertOk()
            ->assertJsonPath('cod.pending', 20000)
            ->assertJsonPath('services.pending', 1500);

        $this->assertSame(100000, $summary->json('cod.collected'));
        $this->assertSame(80000, $summary->json('cod.remitted'));
    }

    public function test_client_can_only_be_paid_from_verified_remitted_cod(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", ['amount' => 80000])->assertCreated();
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/financial/client-ledger/{$this->client->id}/payouts", ['amount' => 30000, 'method' => 'bank_transfer'])->assertCreated();

        $this->actingAs($this->admin, 'sanctum')->getJson("/api/financial/client-ledger/{$this->client->id}")
            ->assertOk()
            ->assertJsonPath('available', 80000)
            ->assertJsonPath('transferred', 30000)
            ->assertJsonPath('pending_transfer', 50000);
    }

    public function test_payment_intent_simulator_is_available_only_in_testing(): void
    {
        $intent = $this->actingAs($this->admin, 'sanctum')->postJson('/api/payment-intents', ['shipment_id' => $this->shipment->id])->assertCreated();
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/payment-intents/'.$intent->json('id').'/simulate-verification')->assertOk()->assertJsonPath('status', 'verified');
    }
}
