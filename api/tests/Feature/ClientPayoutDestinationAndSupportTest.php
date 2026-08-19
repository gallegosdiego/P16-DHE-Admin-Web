<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\ClientCodPayout;
use App\Domain\Financial\Services\ReconciliationLedgerService;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * FIN-04: a donde fue el dinero y con que se prueba.
 */
class ClientPayoutDestinationAndSupportTest extends TestCase
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
        $this->remitToMakeFundsAvailable();
    }

    public function test_an_electronic_transfer_cannot_be_registered_without_destination_account(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/client-ledger/{$this->client->id}/payouts", [
                'amount' => 30000,
                'method' => 'bank_transfer',
            ], ['Idempotency-Key' => 'fin04-01'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['destination_account_number', 'destination_holder_name']);
    }

    public function test_cash_does_not_require_a_destination_account(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/client-ledger/{$this->client->id}/payouts", [
                'amount' => 30000,
                'method' => 'cash',
            ], ['Idempotency-Key' => 'fin04-02'])
            ->assertCreated();
    }

    public function test_destination_is_frozen_on_the_movement_and_the_account_number_travels_masked(): void
    {
        $response = $this->registerTransfer('fin04-03');

        $response
            ->assertJsonPath('destination_bank', 'Bancolombia')
            ->assertJsonPath('destination_holder_name', 'Comercio Uno SAS')
            ->assertJsonPath('destination_account_masked', '····7890')
            ->assertJsonMissingPath('destination_account_number');

        // Completo en base de datos —hace falta para auditar un pago— pero
        // nunca en la respuesta.
        $this->assertDatabaseHas('client_cod_payouts', [
            'id' => $response->json('id'),
            'destination_account_number' => '91234567890',
        ]);
    }

    public function test_support_can_be_attached_afterwards_and_clears_the_pending_counter(): void
    {
        Storage::fake('public');
        $payoutId = $this->registerTransfer('fin04-04')->json('id');

        $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/financial/client-ledger/{$this->client->id}")
            ->assertJsonPath('pending_support', 1)
            ->assertJsonPath('payouts.0.has_support', false);

        $file = UploadedFile::fake()->create('comprobante.pdf', 40, 'application/pdf');

        $this->actingAs($this->admin, 'sanctum')
            ->post("/api/financial/client-payouts/{$payoutId}/support", ['support' => $file])
            ->assertOk()
            ->assertJsonPath('has_support', true)
            ->assertJsonPath('support_uploaded_by.name', $this->admin->name)
            ->assertJsonMissingPath('support_path');

        $payout = ClientCodPayout::findOrFail($payoutId);
        Storage::disk('public')->assertExists($payout->getRawOriginal('support_path'));

        // La URL se arma con PublicAssetUrl, no con Storage::url(): en este
        // despliegue el segundo devuelve localhost y el enlace no abriria.
        $this->assertStringContainsString('/storage/financial/support/client-payouts/', (string) $payout->support_url);
        $this->assertStringStartsWith('http', (string) $payout->support_url);
        $this->assertSame(
            hash('sha256', Storage::disk('public')->get($payout->getRawOriginal('support_path'))),
            $payout->support_sha256,
        );

        $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/financial/client-ledger/{$this->client->id}")
            ->assertJsonPath('pending_support', 0);
    }

    public function test_a_movement_that_already_has_support_does_not_accept_another(): void
    {
        Storage::fake('public');
        $payoutId = $this->registerTransfer('fin04-05')->json('id');

        $this->actingAs($this->admin, 'sanctum')
            ->post("/api/financial/client-payouts/{$payoutId}/support", [
                'support' => UploadedFile::fake()->image('primero.jpg'),
            ])
            ->assertOk();

        $this->actingAs($this->admin, 'sanctum')
            ->post("/api/financial/client-payouts/{$payoutId}/support", [
                'support' => UploadedFile::fake()->image('segundo.jpg'),
            ])
            ->assertStatus(422);
    }

    public function test_executables_are_rejected_as_support(): void
    {
        Storage::fake('public');
        $payoutId = $this->registerTransfer('fin04-06')->json('id');

        $this->actingAs($this->admin, 'sanctum')
            ->post("/api/financial/client-payouts/{$payoutId}/support", [
                'support' => UploadedFile::fake()->create('pago.exe', 10, 'application/x-msdownload'),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['support']);
    }

    public function test_a_reversed_transfer_is_no_longer_counted_as_missing_support(): void
    {
        $payoutId = $this->registerTransfer('fin04-07')->json('id');

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/client-payouts/{$payoutId}/reverse", [
                'reason' => 'La entidad financiera devolvio la transferencia.',
            ], ['Idempotency-Key' => 'fin04-07b'])
            ->assertCreated();

        $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/financial/client-ledger/{$this->client->id}")
            ->assertJsonPath('pending_support', 0);
    }

    private function registerTransfer(string $idempotencyKey): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/client-ledger/{$this->client->id}/payouts", [
                'amount' => 30000,
                'method' => 'bank_transfer',
                'destination_kind' => 'bank_account',
                'destination_bank' => 'Bancolombia',
                'destination_account_type' => 'savings',
                'destination_account_number' => '91234567890',
                'destination_holder_name' => 'Comercio Uno SAS',
                'destination_holder_document' => '900123456-1',
            ], ['Idempotency-Key' => $idempotencyKey])
            ->assertCreated();
    }

    private function remitToMakeFundsAvailable(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/driver-reconciliations/{$this->driver->id}/remittances", [
                'amount' => 80000,
                'method' => 'cash',
            ], ['Idempotency-Key' => 'fin04-00'])
            ->assertCreated();
    }

    private function createDeliveredShipment(int $codAmount = 100000, int $driverFee = 3500): Shipment
    {
        $sequence = (int) (Shipment::withTrashed()->max('sequence_number') ?? 0) + 1;
        $shipment = Shipment::create([
            'client_id' => $this->client->id,
            'driver_id' => $this->driver->id,
            'created_by' => $this->admin->id,
            'tracking_code' => sprintf('FIN%014d', $sequence),
            'display_code' => sprintf('#FIN%05d', $sequence),
            'sequence_number' => $sequence,
            'status' => 'delivered',
            'financial_status' => 'collected',
            'recipient_name' => 'Destinatario FIN-04',
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
