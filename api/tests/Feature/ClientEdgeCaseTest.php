<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClientEdgeCaseTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
        $response = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ]);
        $this->token = $response->json('token');
    }

    private function auth(): array
    {
        return ['Authorization' => "Bearer {$this->token}"];
    }

    public function test_cannot_create_client_without_name(): void
    {
        $response = $this->postJson('/api/clients', [
            'phone' => '300 000 0000',
        ], $this->auth());

        $response->assertUnprocessable();
    }

    public function test_create_client_with_all_fields(): void
    {
        $response = $this->postJson('/api/clients', [
            'name' => 'Cliente Test Edge',
            'phone' => '300 999 8888',
            'email' => 'test@edge.co',
            'company' => 'Edge Corp',
            'nit' => '900999888-1',
            'billing_type' => 'post_sale',
            'notes' => 'Cliente de prueba',
        ], $this->auth());

        $response->assertCreated();
        $this->assertEquals('Cliente Test Edge', $response->json('name'));
        $this->assertEquals('post_sale', $response->json('billing_type'));
    }

    public function test_create_client_accepts_multiple_payment_preferences(): void
    {
        $billingTypes = ['cash_on_delivery', 'post_sale', 'prepaid'];

        $response = $this->postJson('/api/clients', [
            'name' => 'Cliente Multimodal',
            'phone' => '300 111 2233',
            'billing_types' => $billingTypes,
        ], $this->auth());

        $response->assertCreated()
            ->assertJsonPath('billing_type', 'cash_on_delivery')
            ->assertJsonCount(3, 'billing_types');

        $clientId = $response->json('id');
        foreach ($billingTypes as $billingType) {
            $this->assertDatabaseHas('client_payment_types', [
                'client_id' => $clientId,
                'payment_type' => $billingType,
            ]);
        }
    }

    public function test_archiving_client_preserves_shipments_and_can_be_restored(): void
    {
        $client = Client::create([
            'name' => 'Cliente con historial',
            'phone' => '300 444 5566',
            'billing_type' => 'cash_on_delivery',
        ]);
        $shipment = Shipment::withoutEvents(fn () => Shipment::create([
            'tracking_code' => 'DHE2026072900999',
            'display_code' => '#DHE90999',
            'sequence_number' => 90999,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Destinatario histórico',
            'recipient_phone' => '300 000 0000',
            'recipient_address' => 'Calle 1 #2-3',
            'status' => 'registered',
            'payment_type' => 'post_sale',
            'shipping_cost' => 15000,
            'financial_status' => 'pending',
        ]));

        $deleteResponse = $this->deleteJson("/api/clients/{$client->id}", [], $this->auth());

        $deleteResponse->assertOk()
            ->assertJsonPath('id', $client->id)
            ->assertJsonPath('shipments_count', 1);
        $this->assertSoftDeleted('clients', ['id' => $client->id]);
        $this->assertDatabaseHas('shipments', ['id' => $shipment->id, 'client_id' => $client->id]);
        $this->assertSame($client->id, $shipment->fresh()->client?->id);

        $this->getJson('/api/clients', $this->auth())
            ->assertOk()
            ->assertJsonMissing(['id' => $client->id]);

        $this->postJson("/api/clients/{$client->id}/restore", [], $this->auth())
            ->assertOk()
            ->assertJsonPath('id', $client->id)
            ->assertJsonPath('is_active', true);

        $this->assertDatabaseHas('clients', [
            'id' => $client->id,
            'deleted_at' => null,
            'is_active' => 1,
        ]);
    }

    public function test_receivable_uses_shipment_payment_type_not_client_preference(): void
    {
        $client = Client::create([
            'name' => 'Cliente con pagos mixtos',
            'phone' => '300 777 8899',
            'billing_type' => 'cash_on_delivery',
        ]);
        Shipment::withoutEvents(fn () => Shipment::create([
            'tracking_code' => 'DHE2026072900888',
            'display_code' => '#DHE90888',
            'sequence_number' => 90888,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Destinatario post venta',
            'recipient_phone' => '300 000 0001',
            'recipient_address' => 'Carrera 4 #5-6',
            'status' => 'registered',
            'payment_type' => 'post_sale',
            'shipping_cost' => 22000,
            'financial_status' => 'pending',
        ]));

        $response = $this->getJson('/api/clients-receivable', $this->auth());

        $response->assertOk();
        $receivable = collect($response->json('clients'))
            ->firstWhere('id', $client->id);

        $this->assertNotNull($receivable);
        $this->assertSame(22000, $receivable['total_owed']);
    }

    public function test_list_clients_with_search(): void
    {
        $client = Client::first();

        $response = $this->getJson("/api/clients?search={$client->name}", $this->auth());
        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, count($response->json('data')));
    }

    public function test_client_detail_includes_addresses(): void
    {
        // María Gómez tiene dirección
        $client = Client::whereHas('addresses')->first();
        if (! $client) {
            $this->markTestSkipped('No hay clientes con direcciones');
        }

        $response = $this->getJson("/api/clients/{$client->id}", $this->auth());
        $response->assertOk();
        $response->assertJsonStructure([
            'addresses',
            'financial_summary' => ['total_shipments', 'total_owed', 'total_revenue'],
        ]);
    }

    public function test_client_detail_includes_financial_summary(): void
    {
        $client = Client::first();

        $response = $this->getJson("/api/clients/{$client->id}", $this->auth());
        $response->assertOk();

        $summary = $response->json('financial_summary');
        $this->assertIsInt($summary['total_shipments']);
        $this->assertIsInt($summary['total_owed']);
        $this->assertIsInt($summary['total_revenue']);
    }

    public function test_store_address_for_client(): void
    {
        $client = Client::first();

        $response = $this->postJson("/api/clients/{$client->id}/addresses", [
            'address' => 'Cl 45 #10-20, Apto 302',
            'zone' => 'Chapinero',
            'label' => 'Oficina',
        ], $this->auth());

        $response->assertCreated();
        $this->assertEquals('Oficina', $response->json('label'));
    }

    public function test_update_client(): void
    {
        $client = Client::first();

        $response = $this->putJson("/api/clients/{$client->id}", [
            'notes' => 'Nota actualizada via test',
        ], $this->auth());

        $response->assertOk();
        $this->assertEquals('Nota actualizada via test', $response->json('notes'));
    }

    public function test_client_pagination(): void
    {
        $response = $this->getJson('/api/clients?per_page=3', $this->auth());
        $response->assertOk();
        $this->assertLessThanOrEqual(3, count($response->json('data')));
        $response->assertJsonStructure([
            'current_page', 'last_page', 'total',
        ]);
    }
}
