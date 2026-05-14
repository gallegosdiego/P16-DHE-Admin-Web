<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
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
