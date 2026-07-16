<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\ClientCodEntitlement;
use App\Domain\Financial\Models\DriverCodObligation;
use App\Domain\Financial\Models\DriverCodRemittance;
use App\Domain\Financial\Services\ReconciliationLedgerService;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
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
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->seed(DemoDataSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();
        $this->driver = Driver::where('status', 'active')->firstOrFail();
        $this->client = Client::firstOrFail();
        $this->shipment = $this->createDeliveredShipment();
    }

    public function test_cod_and_driver_service_balances_are_independent_and_partially_allocated(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", [
            'amount' => 80000,
            'method' => 'cash',
        ], ['Idempotency-Key' => 'driver-remittance-balance-001'])->assertCreated();

        $this->actingAs($this->admin, 'sanctum')->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/service-payments", [
            'amount' => 2000,
            'method' => 'nequi',
        ], ['Idempotency-Key' => 'driver-service-payment-001'])->assertCreated();

        $summary = $this->actingAs($this->admin, 'sanctum')->getJson("/api/financial/driver-reconciliations/{$this->driver->id}")
            ->assertOk()
            ->assertJsonPath('cod.pending', 20000)
            ->assertJsonPath('services.pending', 1500)
            ->assertJsonPath('remittances.0.amount', 80000)
            ->assertJsonPath('remittances.0.received_by.name', $this->admin->name)
            ->assertJsonPath('remittances.0.allocations.0.obligation.shipment.display_code', $this->shipment->display_code)
            ->assertJsonPath('service_payments.0.amount', 2000)
            ->assertJsonPath('service_payments.0.paid_by.name', $this->admin->name)
            ->assertJsonPath('service_payments.0.allocations.0.earning.shipment.display_code', $this->shipment->display_code);

        $this->assertSame(100000, $summary->json('cod.collected'));
        $this->assertSame(80000, $summary->json('cod.remitted'));
    }

    public function test_client_can_only_be_paid_from_verified_remitted_cod(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", ['amount' => 80000], ['Idempotency-Key' => 'client-remittance-001'])
            ->assertCreated();

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/client-ledger/{$this->client->id}/payouts", ['amount' => 30000, 'method' => 'bank_transfer'], ['Idempotency-Key' => 'client-payout-001'])
            ->assertCreated();

        $this->actingAs($this->admin, 'sanctum')->getJson("/api/financial/client-ledger/{$this->client->id}")
            ->assertOk()
            ->assertJsonPath('available', 80000)
            ->assertJsonPath('transferred', 30000)
            ->assertJsonPath('pending_transfer', 50000)
            ->assertJsonPath('payouts.0.amount', 30000)
            ->assertJsonPath('payouts.0.paid_by.name', $this->admin->name)
            ->assertJsonPath('payouts.0.allocations.0.entitlement.shipment.display_code', $this->shipment->display_code);
    }

    public function test_manual_allocations_reject_duplicate_lines(): void
    {
        $obligationId = DriverCodObligation::query()->where('shipment_id', $this->shipment->id)->value('id');

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", [
                'amount' => 100000,
                'allocations' => [
                    ['id' => $obligationId, 'amount' => 50000],
                    ['id' => $obligationId, 'amount' => 50000],
                ],
            ], ['Idempotency-Key' => 'manual-duplicate-lines-001'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'No se puede repetir la misma línea dentro de una asignación manual.');
    }

    public function test_manual_allocations_must_cover_the_full_payment_amount(): void
    {
        $obligationId = DriverCodObligation::query()->where('shipment_id', $this->shipment->id)->value('id');

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", [
                'amount' => 60000,
                'allocations' => [
                    ['id' => $obligationId, 'amount' => 50000],
                ],
            ], ['Idempotency-Key' => 'manual-full-cover-001'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'El valor del movimiento debe quedar asignado completamente a saldos pendientes.');
    }

    public function test_automatic_allocations_reject_amounts_above_pending_balance(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", [
                'amount' => 120000,
            ], ['Idempotency-Key' => 'remittance-too-large'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'El valor del movimiento debe quedar asignado completamente a saldos pendientes.');
    }

    public function test_client_payout_manual_allocations_must_match_available_balance(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", ['amount' => 80000], ['Idempotency-Key' => 'remittance-client-balance'])
            ->assertCreated();

        $entitlementId = ClientCodEntitlement::query()->where('shipment_id', $this->shipment->id)->value('id');

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/client-ledger/{$this->client->id}/payouts", [
                'amount' => 50000,
                'allocations' => [
                    ['id' => $entitlementId, 'amount' => 30000],
                ],
            ], ['Idempotency-Key' => 'client-payout-full-cover-001'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'El valor del movimiento debe quedar asignado completamente a saldos pendientes.');
    }

    public function test_financial_movements_are_idempotent_per_key_and_payload(): void
    {
        $payload = ['amount' => 80000, 'method' => 'cash'];
        $headers = ['Idempotency-Key' => 'remittance-retry-001'];

        $first = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", $payload, $headers);

        $second = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", $payload, $headers);

        $first->assertCreated();
        $second->assertCreated();
        $this->assertSame($first->json('id'), $second->json('id'));
        $this->assertDatabaseCount((new DriverCodRemittance)->getTable(), 1);
    }

    public function test_financial_idempotency_key_cannot_be_reused_with_a_different_payload(): void
    {
        $headers = ['Idempotency-Key' => 'remittance-retry-002'];

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", ['amount' => 60000], $headers)
            ->assertCreated();

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", ['amount' => 50000], $headers)
            ->assertStatus(422)
            ->assertJsonValidationErrors('idempotency_key');
    }

    public function test_payment_intent_simulator_is_available_only_in_testing(): void
    {
        $intent = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/payment-intents', ['shipment_id' => $this->shipment->id])
            ->assertCreated();

        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/payment-intents/'.$intent->json('id').'/simulate-verification')
            ->assertOk()
            ->assertJsonPath('status', 'verified');
    }

    private function createDeliveredShipment(int $codAmount = 100000, int $driverFee = 3500): Shipment
    {
        $sequence = (int) (Shipment::withTrashed()->max('sequence_number') ?? 0) + 1;
        $shipment = Shipment::create([
            'client_id' => $this->client->id,
            'driver_id' => $this->driver->id,
            'created_by' => $this->admin->id,
            'tracking_code' => sprintf('LED%014d', $sequence),
            'display_code' => sprintf('#LED%05d', $sequence),
            'sequence_number' => $sequence,
            'status' => 'delivered',
            'financial_status' => 'collected',
            'recipient_name' => 'Destinatario Ledger',
            'recipient_phone' => '3000000000',
            'recipient_address' => 'Calle 10 # 20-30',
            'recipient_city' => 'Bogotá',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => $codAmount,
            'cod_collected_amount' => $codAmount,
            'cod_payment_method' => 'Efectivo',
            'cod_collected_at' => now(),
            'driver_fee' => $driverFee,
            'delivered_at' => now(),
        ]);

        app(ReconciliationLedgerService::class)->recordDeliveredShipment($shipment);

        return $shipment;
    }
}
