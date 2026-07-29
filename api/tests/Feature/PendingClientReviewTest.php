<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\ClientCodEntitlement;
use App\Domain\Financial\Models\DriverCodObligation;
use App\Domain\Financial\Services\ReconciliationLedgerService;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PendingClientReviewTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();
    }

    public function test_unassigned_shipment_can_be_reviewed_and_linked_without_replacing_sender_snapshot(): void
    {
        $created = $this->actingAs($this->admin, 'sanctum')->postJson('/api/shipments', [
            'sender_name' => 'Remitente externo',
            'sender_phone' => '300 111 2233',
            'sender_email' => 'remitente@example.com',
            'sender_company' => 'Empresa remitente',
            'recipient_name' => 'Persona destinataria',
            'recipient_phone' => '300 444 5566',
            'recipient_address' => 'Calle 10 # 20-30',
            'recipient_city' => 'Bogota',
            'payment_type' => 'post_sale',
            'shipping_cost' => 18000,
        ]);

        $created->assertCreated()->assertJsonPath('client_id', null);
        $shipmentId = (int) $created->json('id');

        $this->assertDatabaseHas('shipments', [
            'id' => $shipmentId,
            'client_id' => null,
            'sender_name' => 'Remitente externo',
            'sender_company' => 'Empresa remitente',
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/shipments/pending-client-review')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $shipmentId)
            ->assertJsonPath('data.0.sender_name', 'Remitente externo');

        $client = Client::create([
            'name' => 'Contacto de cobro',
            'phone' => '311 777 8899',
            'email' => 'cobros@example.com',
            'company' => 'Empresa del cliente',
            'billing_type' => 'post_sale',
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/shipments/{$shipmentId}/link-client", ['client_id' => $client->id])
            ->assertOk()
            ->assertJsonPath('client_id', $client->id)
            ->assertJsonPath('sender_name', 'Remitente externo');

        $this->assertDatabaseHas('shipments', [
            'id' => $shipmentId,
            'client_id' => $client->id,
            'sender_name' => 'Remitente externo',
            'sender_phone' => '300 111 2233',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'shipments.client_linked',
            'entity_type' => 'Shipment',
            'entity_id' => $shipmentId,
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/shipments/pending-client-review')
            ->assertOk()
            ->assertJsonPath('total', 0);
    }

    public function test_unassigned_post_sale_shipment_is_not_charged_to_an_unknown_client(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/shipments', [
            'sender_name' => 'Contacto sin identificar',
            'recipient_name' => 'Destinatario',
            'recipient_phone' => '300 000 0000',
            'recipient_address' => 'Carrera 1 # 2-3',
            'payment_type' => 'post_sale',
            'shipping_cost' => 12000,
        ])->assertCreated();

        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/financial/aging-report')
            ->assertOk()
            ->assertJsonPath('summary.total_receivable', 0)
            ->assertJsonPath('pending_client_review.count', 1)
            ->assertJsonPath('pending_client_review.amount', 12000)
            ->assertJsonCount(0, 'clients');
    }

    public function test_linking_collected_cod_backfills_the_client_ledger_after_review(): void
    {
        $driver = Driver::create([
            'name' => 'Conductor de prueba',
            'initials' => 'CP',
            'phone' => '320 000 0000',
            'status' => 'active',
            'per_package_rate' => 3500,
        ]);
        $sequence = (int) (Shipment::withTrashed()->max('sequence_number') ?? 0) + 1;
        $shipment = Shipment::create([
            'client_id' => null,
            'driver_id' => $driver->id,
            'created_by' => $this->admin->id,
            'tracking_code' => sprintf('COD%014d', $sequence),
            'display_code' => sprintf('#COD%05d', $sequence),
            'sequence_number' => $sequence,
            'status' => 'delivered',
            'financial_status' => 'collected',
            'sender_name' => 'Contacto pendiente',
            'recipient_name' => 'Destinatario COD',
            'recipient_phone' => '320 111 2233',
            'recipient_address' => 'Calle 5 # 6-7',
            'recipient_city' => 'Bogota',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => 100000,
            'cod_collected_amount' => 100000,
            'cod_payment_method' => 'cash',
            'cod_collected_at' => now(),
            'driver_fee' => 3500,
            'delivered_at' => now(),
        ]);

        app(ReconciliationLedgerService::class)->recordDeliveredShipment($shipment);
        $obligation = DriverCodObligation::where('shipment_id', $shipment->id)->firstOrFail();
        $this->assertNull($obligation->client_id);
        $this->assertDatabaseMissing('client_cod_entitlements', ['shipment_id' => $shipment->id]);

        $obligation->update([
            'remitted_amount' => 40000,
            'status' => 'partial',
        ]);
        $client = Client::create([
            'name' => 'Cliente COD identificado',
            'phone' => '311 111 2233',
            'billing_type' => 'cash_on_delivery',
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/link-client", ['client_id' => $client->id])
            ->assertOk();

        $this->assertDatabaseHas('driver_cod_obligations', [
            'id' => $obligation->id,
            'client_id' => $client->id,
        ]);
        $this->assertDatabaseHas('client_cod_entitlements', [
            'shipment_id' => $shipment->id,
            'client_id' => $client->id,
            'reported_amount' => 100000,
            'available_amount' => 40000,
            'status' => 'available',
        ]);
    }
}
