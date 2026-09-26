<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\ClientCodEntitlement;
use App\Domain\Financial\Models\DriverCodObligation;
use App\Domain\Financial\Models\DriverCodRemittance;
use App\Domain\Financial\Services\ReconciliationLedgerService;
use App\Domain\Shipment\Models\Route;
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
            ->postJson("/api/financial/client-ledger/{$this->client->id}/payouts", [
                'amount' => 30000,
                'method' => 'bank_transfer',
                'destination_kind' => 'bank_account',
                'destination_bank' => 'Bancolombia',
                'destination_account_type' => 'savings',
                'destination_account_number' => '91234567890',
                'destination_holder_name' => 'Comercio Uno SAS',
            ], ['Idempotency-Key' => 'client-payout-001'])
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
                'method' => 'cash',
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

    public function test_digital_cod_is_not_cash_the_pilot_owes(): void
    {
        $digital = $this->createDeliveredShipment(40000, 3500, 'Nequi');

        $summary = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/financial/driver-reconciliations/{$this->driver->id}")
            ->assertOk()
            ->assertJsonPath('cod.pending', 100000)
            ->assertJsonPath('cod.cash_pending', 100000)
            ->assertJsonPath('cod.collected', 100000)
            ->assertJsonPath('cod.total_collected', 140000)
            ->assertJsonPath('cod.digital.pending', 40000)
            ->assertJsonPath('cod.digital.verified', 0)
            ->assertJsonPath('cod.digital.lines.0.shipment.display_code', $digital->display_code)
            ->assertJsonPath('cod.digital.lines.0.channel', 'digital');

        $this->assertSame([$this->shipment->id], array_column($summary->json('cod.lines'), 'shipment_id'));
        $this->assertSame('cash', $summary->json('cod.lines.0.channel'));

        // La app del piloto lee el mismo contrato: "Debes entregar" es solo efectivo.
        $driverUser = User::query()->create([
            'name' => 'Piloto Recaudo',
            'email' => 'recaudo-digital@danhei.test',
            'password' => bcrypt('Piloto2026!'),
            'driver_id' => $this->driver->id,
        ]);
        $driverUser->assignRole('driver');
        $this->driver->update(['user_id' => $driverUser->id]);

        $this->actingAs($driverUser, 'sanctum')->getJson('/api/driver/reconciliation')
            ->assertOk()
            ->assertJsonStructure(['driver', 'cod' => ['collected', 'remitted', 'pending', 'lines', 'digital'], 'services' => ['earned', 'paid', 'pending'], 'remittances', 'service_payments', 'rule'])
            ->assertJsonPath('cod.pending', 100000)
            ->assertJsonPath('cod.remitted', 0)
            ->assertJsonPath('cod.digital.pending', 40000);
    }

    public function test_cash_remittance_never_consumes_digital_payments(): void
    {
        $this->createDeliveredShipment(40000, 3500, 'Transferencia');

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", ['amount' => 140000, 'method' => 'cash'], ['Idempotency-Key' => 'cash-too-much-digital'])
            ->assertStatus(422);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", ['amount' => 100000, 'method' => 'cash'], ['Idempotency-Key' => 'cash-only-digital'])
            ->assertCreated()
            ->assertJsonPath('balance_before', 100000)
            ->assertJsonPath('balance_after', 0);

        $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/financial/driver-reconciliations/{$this->driver->id}")
            ->assertJsonPath('cod.pending', 0)
            ->assertJsonPath('cod.digital.pending', 40000);
    }

    public function test_cash_endpoint_cannot_be_used_to_verify_digital_payments(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", ['amount' => 1000, 'method' => DriverCodObligation::DIGITAL_VERIFICATION_METHOD], ['Idempotency-Key' => 'cash-endpoint-digital'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('method');
    }

    public function test_admin_verifies_a_digital_payment_and_can_reverse_it(): void
    {
        $digital = $this->createDeliveredShipment(40000, 3500, 'Daviplata');
        $obligationId = DriverCodObligation::query()->where('shipment_id', $digital->id)->value('id');

        $verification = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/digital-verifications", [
                'obligation_ids' => [$obligationId],
                'external_reference' => 'DAVI-123',
            ], ['Idempotency-Key' => 'digital-verify-001'])
            ->assertCreated()
            ->assertJsonPath('method', DriverCodObligation::DIGITAL_VERIFICATION_METHOD)
            ->assertJsonPath('amount', 40000)
            ->assertJsonPath('balance_before', 40000)
            ->assertJsonPath('balance_after', 0);

        $this->assertSame('settled', $digital->fresh()->getRawOriginal('financial_status'));
        $this->assertSame(40000, (int) ClientCodEntitlement::query()->where('shipment_id', $digital->id)->value('available_amount'));
        $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/financial/driver-reconciliations/{$this->driver->id}")
            ->assertJsonPath('cod.pending', 100000)
            ->assertJsonPath('cod.digital.pending', 0)
            ->assertJsonPath('cod.digital.verified', 40000);

        // Verificar dos veces el mismo pago no es posible.
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/digital-verifications", [
                'obligation_ids' => [$obligationId],
            ], ['Idempotency-Key' => 'digital-verify-002'])
            ->assertStatus(422);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/financial/driver-remittances/'.$verification->json('id').'/reverse', [
                'reason' => 'El pago no aparece en el extracto del banco.',
            ], ['Idempotency-Key' => 'digital-verify-reverse'])
            ->assertCreated()
            ->assertJsonPath('balance_before', 0)
            ->assertJsonPath('balance_after', 40000);

        $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/financial/driver-reconciliations/{$this->driver->id}")
            ->assertJsonPath('cod.pending', 100000)
            ->assertJsonPath('cod.digital.pending', 40000);
    }

    public function test_digital_verification_rejects_cash_obligations(): void
    {
        $cashObligationId = DriverCodObligation::query()->where('shipment_id', $this->shipment->id)->value('id');

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/digital-verifications", [
                'obligation_ids' => [$cashObligationId],
            ], ['Idempotency-Key' => 'digital-verify-cash'])
            ->assertStatus(422);

        $this->assertSame(0, DriverCodRemittance::query()->count());
    }

    public function test_day_close_shows_cash_to_remit_and_digital_pending_from_the_ledger(): void
    {
        $this->createDeliveredShipment(40000, 3500, 'Nequi');
        $date = now()->toDateString();
        Route::query()->create([
            'driver_id' => $this->driver->id,
            'route_date' => $date,
            'status' => 'completed',
        ]);

        $row = collect($this->actingAs($this->admin, 'sanctum')->getJson("/api/routes/day-close?date={$date}")->assertOk()->json('drivers'))
            ->firstWhere('driver_id', $this->driver->id);
        $this->assertNotNull($row);
        $this->assertSame(100000, $row['ledger']['cash_to_remit']);
        $this->assertSame(40000, $row['ledger']['digital_pending']);
        $this->assertSame(1, $row['ledger']['digital_pending_count']);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", ['amount' => 100000, 'method' => 'cash'], ['Idempotency-Key' => 'day-close-cash'])
            ->assertCreated();

        $row = collect($this->actingAs($this->admin, 'sanctum')->getJson("/api/routes/day-close?date={$date}")->json('drivers'))
            ->firstWhere('driver_id', $this->driver->id);
        $this->assertSame(0, $row['ledger']['cash_to_remit']);
        $this->assertSame(40000, $row['ledger']['digital_pending']);
    }

    private function createDeliveredShipment(int $codAmount = 100000, int $driverFee = 3500, string $paymentMethod = 'Efectivo'): Shipment
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
            'cod_payment_method' => $paymentMethod,
            'cod_collected_at' => now(),
            'driver_fee' => $driverFee,
            'delivered_at' => now(),
        ]);

        app(ReconciliationLedgerService::class)->recordDeliveredShipment($shipment);

        return $shipment;
    }
}
