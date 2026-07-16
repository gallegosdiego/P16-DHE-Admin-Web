<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\DriverCodRemittance;
use App\Domain\Financial\Models\FinancialOpeningEntry;
use App\Domain\Financial\Services\ReconciliationLedgerService;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinancialControlsTest extends TestCase
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
        $this->admin = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();
        $this->driver = Driver::query()->where('status', 'active')->firstOrFail();
        $this->client = Client::query()->firstOrFail();
        $this->shipment = $this->createDeliveredShipment();
    }

    public function test_receipts_persist_balance_before_and_after_for_each_account(): void
    {
        $remittance = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", [
                'amount' => 80000,
            ], ['Idempotency-Key' => 'receipt-balance-remittance'])
            ->assertCreated()
            ->assertJsonPath('balance_before', 100000)
            ->assertJsonPath('balance_after', 20000)
            ->assertJsonPath('approved_by.id', $this->admin->id);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/service-payments", [
                'amount' => 2000,
            ], ['Idempotency-Key' => 'receipt-balance-service'])
            ->assertCreated()
            ->assertJsonPath('balance_before', 3500)
            ->assertJsonPath('balance_after', 1500);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/client-ledger/{$this->client->id}/payouts", [
                'amount' => 30000,
            ], ['Idempotency-Key' => 'receipt-balance-client'])
            ->assertCreated()
            ->assertJsonPath('balance_before', 80000)
            ->assertJsonPath('balance_after', 50000);

        $this->assertSame($remittance->json('amount'), $remittance->json('allocated_amount'));
    }

    public function test_cod_remittance_reversal_restores_driver_and_client_balances(): void
    {
        $remittance = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", [
                'amount' => 80000,
            ], ['Idempotency-Key' => 'reverse-remittance-source'])
            ->assertCreated();

        $reversal = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-remittances/{$remittance->json('id')}/reverse", [
                'reason' => 'Se anuló por diferencia confirmada en caja.',
            ], ['Idempotency-Key' => 'reverse-remittance-action'])
            ->assertCreated()
            ->assertJsonPath('movement_type', 'reversal')
            ->assertJsonPath('balance_before', 20000)
            ->assertJsonPath('balance_after', 100000)
            ->assertJsonPath('reversal_of.id', $remittance->json('id'));

        $summary = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/financial/driver-reconciliations/{$this->driver->id}")
            ->assertOk()
            ->assertJsonPath('cod.remitted', 0)
            ->assertJsonPath('cod.pending', 100000);
        $originalMovement = collect($summary->json('remittances'))
            ->firstWhere('id', $remittance->json('id'));
        $this->assertSame($reversal->json('reference'), data_get($originalMovement, 'reversal.reference'));

        $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/financial/client-ledger/{$this->client->id}")
            ->assertOk()
            ->assertJsonPath('available', 0);

        $this->assertDatabaseHas('driver_cod_remittances', [
            'id' => $remittance->json('id'),
            'status' => 'reversed',
        ]);
        $this->assertSame(80000, $reversal->json('allocated_amount'));
        $audit = AuditLog::query()
            ->where('action', 'financial.driver_cod_remittance_reversed')
            ->latest('id')
            ->firstOrFail();
        $this->assertSame($reversal->json('reference'), $audit->new_values['reversal_reference']);
    }

    public function test_cod_remittance_cannot_be_reversed_after_client_funds_were_transferred(): void
    {
        $remittance = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", [
                'amount' => 80000,
            ], ['Idempotency-Key' => 'reverse-blocked-remittance'])
            ->assertCreated();

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/client-ledger/{$this->client->id}/payouts", [
                'amount' => 30000,
            ], ['Idempotency-Key' => 'reverse-blocked-client-payment'])
            ->assertCreated();

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-remittances/{$remittance->json('id')}/reverse", [
                'reason' => 'Intento posterior a transferencia al cliente.',
            ], ['Idempotency-Key' => 'reverse-blocked-action'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'No se puede reversar la remesa porque el cliente ya recibió fondos asociados.');
    }

    public function test_service_payment_and_client_payout_reversals_restore_pending_balances(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", [
                'amount' => 80000,
            ], ['Idempotency-Key' => 'reversal-setup-remittance'])
            ->assertCreated();
        $servicePayment = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/service-payments", [
                'amount' => 2000,
            ], ['Idempotency-Key' => 'reversal-service-source'])
            ->assertCreated();
        $clientPayout = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/client-ledger/{$this->client->id}/payouts", [
                'amount' => 30000,
            ], ['Idempotency-Key' => 'reversal-client-source'])
            ->assertCreated();

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-service-payments/{$servicePayment->json('id')}/reverse", [
                'reason' => 'Pago devuelto por la entidad financiera.',
            ], ['Idempotency-Key' => 'reversal-service-action'])
            ->assertCreated()
            ->assertJsonPath('balance_after', 3500);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/client-payouts/{$clientPayout->json('id')}/reverse", [
                'reason' => 'Transferencia rechazada por cuenta inválida.',
            ], ['Idempotency-Key' => 'reversal-client-action'])
            ->assertCreated()
            ->assertJsonPath('balance_after', 80000);

        $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/financial/driver-reconciliations/{$this->driver->id}")
            ->assertJsonPath('services.pending', 3500);
        $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/financial/client-ledger/{$this->client->id}")
            ->assertJsonPath('pending_transfer', 80000);
    }

    public function test_opening_entries_create_explicit_lines_without_inventing_shipments(): void
    {
        $requests = [
            [
                'account_type' => 'driver_cod_due',
                'driver_id' => $this->driver->id,
                'amount' => 120000,
                'support_reference' => 'CORTE-COD-001',
            ],
            [
                'account_type' => 'driver_service_payable',
                'driver_id' => $this->driver->id,
                'amount' => 45000,
                'support_reference' => 'CORTE-PIL-001',
            ],
            [
                'account_type' => 'client_cod_available',
                'client_id' => $this->client->id,
                'amount' => 90000,
                'support_reference' => 'CORTE-CLI-001',
            ],
        ];

        foreach ($requests as $index => $payload) {
            $this->actingAs($this->admin, 'sanctum')
                ->postJson('/api/financial/opening-entries', array_merge($payload, [
                    'effective_date' => today()->subDay()->toDateString(),
                    'notes' => 'Saldo confirmado para inicio del sistema.',
                ]), ['Idempotency-Key' => "opening-entry-{$index}"])
                ->assertCreated()
                ->assertJsonPath('amount', $payload['amount']);
        }

        $this->assertDatabaseCount((new FinancialOpeningEntry)->getTable(), 3);
        $this->assertDatabaseHas('driver_cod_obligations', [
            'shipment_id' => null,
            'collected_amount' => 120000,
        ]);
        $this->assertDatabaseHas('driver_service_earnings', [
            'shipment_id' => null,
            'service_type' => 'opening_balance',
            'amount' => 45000,
        ]);
        $this->assertDatabaseHas('client_cod_entitlements', [
            'shipment_id' => null,
            'available_amount' => 90000,
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/financial/opening-entries')
            ->assertOk()
            ->assertJsonCount(3, 'data');

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", [
                'amount' => 120000,
            ], ['Idempotency-Key' => 'opening-entry-remittance'])
            ->assertCreated();
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/service-payments", [
                'amount' => 45000,
            ], ['Idempotency-Key' => 'opening-entry-service-payment'])
            ->assertCreated();
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/client-ledger/{$this->client->id}/payouts", [
                'amount' => 90000,
            ], ['Idempotency-Key' => 'opening-entry-client-payout'])
            ->assertCreated();

        $this->assertDatabaseHas('driver_cod_obligations', [
            'shipment_id' => null,
            'remitted_amount' => 120000,
            'status' => 'remitted',
        ]);
        $this->assertDatabaseHas('driver_service_earnings', [
            'shipment_id' => null,
            'paid_amount' => 45000,
            'status' => 'paid',
        ]);
        $this->assertDatabaseHas('client_cod_entitlements', [
            'shipment_id' => null,
            'transferred_amount' => 90000,
            'status' => 'transferred',
        ]);
    }

    public function test_reversal_and_opening_permissions_are_not_granted_to_operator(): void
    {
        $operator = User::query()->where('email', 'operador@danheiexpress.com')->firstOrFail();
        $remittance = DriverCodRemittance::query()->create([
            'reference' => 'REM-PERMISSION-001',
            'driver_id' => $this->driver->id,
            'received_by' => $this->admin->id,
            'approved_by' => $this->admin->id,
            'amount' => 1000,
            'allocated_amount' => 1000,
            'balance_before' => 1000,
            'balance_after' => 0,
            'movement_type' => 'standard',
            'status' => 'received',
            'method' => 'cash',
            'received_at' => now(),
            'approved_at' => now(),
        ]);

        $this->actingAs($operator, 'sanctum')
            ->postJson("/api/financial/driver-remittances/{$remittance->id}/reverse", [
                'reason' => 'Operador sin permiso para reversar.',
            ], ['Idempotency-Key' => 'operator-reversal'])
            ->assertForbidden();
        $this->actingAs($operator, 'sanctum')
            ->postJson('/api/financial/opening-entries', [
                'account_type' => 'driver_cod_due',
                'driver_id' => $this->driver->id,
                'amount' => 1000,
                'effective_date' => today()->toDateString(),
                'support_reference' => 'NO-AUTORIZADO',
            ], ['Idempotency-Key' => 'operator-opening'])
            ->assertForbidden();
    }

    private function createDeliveredShipment(): Shipment
    {
        $sequence = (int) (Shipment::withTrashed()->max('sequence_number') ?? 0) + 1;
        $shipment = Shipment::query()->create([
            'client_id' => $this->client->id,
            'driver_id' => $this->driver->id,
            'created_by' => $this->admin->id,
            'tracking_code' => sprintf('CTL%014d', $sequence),
            'display_code' => sprintf('#CTL%05d', $sequence),
            'sequence_number' => $sequence,
            'status' => 'delivered',
            'financial_status' => 'collected',
            'recipient_name' => 'Destinatario controles',
            'recipient_phone' => '3000000000',
            'recipient_address' => 'Calle 20 # 10-30',
            'recipient_city' => 'Bogotá',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => 100000,
            'cod_collected_amount' => 100000,
            'cod_payment_method' => 'Efectivo',
            'cod_collected_at' => now(),
            'driver_fee' => 3500,
            'delivered_at' => now(),
        ]);

        app(ReconciliationLedgerService::class)->recordDeliveredShipment($shipment);

        return $shipment;
    }
}
