<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Models\ShipmentEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ClientPortalTest extends TestCase
{
    use RefreshDatabase;

    private User $clientUser;
    private User $adminUser;
    private Client $client;
    private Client $otherClient;
    private Shipment $ownShipment;
    private Shipment $otherShipment;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->client = Client::create([
            'name' => 'Cliente Portal',
            'phone' => '3001112233',
            'email' => 'cliente@portal.com',
            'billing_type' => 'post_sale',
        ]);
        $this->otherClient = Client::create([
            'name' => 'Otro Cliente',
            'phone' => '3009998899',
            'email' => 'otro@portal.com',
            'billing_type' => 'cash_on_delivery',
        ]);

        $this->clientUser = User::create([
            'name' => 'Cliente Usuario',
            'email' => 'cliente@portal.com',
            'password' => Hash::make('secret123'),
            'client_id' => $this->client->id,
        ]);
        $this->clientUser->assignRole('cliente');

        $this->adminUser = User::where('email', 'admin@danheiexpress.com')->firstOrFail();

        $this->ownShipment = Shipment::create([
            'tracking_code' => 'DHEPORTAL0001',
            'display_code' => '#DHE90001',
            'sequence_number' => 90001,
            'client_id' => $this->client->id,
            'created_by' => $this->adminUser->id,
            'recipient_name' => 'Ana Cliente',
            'recipient_phone' => '3002223344',
            'recipient_address' => 'Cl 1 #1-1',
            'recipient_zone' => 'Centro',
            'recipient_city' => 'Bogota',
            'status' => 'in_transit',
            'payment_type' => 'post_sale',
            'shipping_cost' => 12000,
            'cod_amount' => 0,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ]);

        ShipmentEvent::create([
            'shipment_id' => $this->ownShipment->id,
            'user_id' => $this->adminUser->id,
            'from_status' => null,
            'to_status' => 'registered',
            'description' => 'Creado',
            'occurred_at' => now()->subHour(),
        ]);

        $this->otherShipment = Shipment::create([
            'tracking_code' => 'DHEPORTAL0002',
            'display_code' => '#DHE90002',
            'sequence_number' => 90002,
            'client_id' => $this->otherClient->id,
            'created_by' => $this->adminUser->id,
            'recipient_name' => 'Pedro Externo',
            'recipient_phone' => '3005556677',
            'recipient_address' => 'Cl 2 #2-2',
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => 25000,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ]);
    }

    public function test_client_can_see_dashboard(): void
    {
        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson('/api/client-portal/dashboard');

        $response->assertOk()
            ->assertJsonStructure(['total_shipments', 'in_transit', 'delivered_today', 'pending_payment']);
    }

    public function test_client_can_list_own_shipments(): void
    {
        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson('/api/client-portal/shipments');

        $response->assertOk()
            ->assertJsonPath('data.0.client_id', $this->client->id);
    }

    public function test_client_cannot_see_other_client_shipments(): void
    {
        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson('/api/client-portal/shipments');

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertNotContains($this->otherShipment->id, $ids);
    }

    public function test_client_can_see_shipment_detail_with_timeline(): void
    {
        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson("/api/client-portal/shipments/{$this->ownShipment->id}");

        $response->assertOk()
            ->assertJsonStructure([
                'shipment' => ['id', 'display_code', 'status', 'status_label'],
                'timeline',
            ]);
    }

    public function test_client_cannot_see_shipment_from_another_client(): void
    {
        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson("/api/client-portal/shipments/{$this->otherShipment->id}");

        $response->assertForbidden();
    }

    public function test_client_can_see_financial_summary(): void
    {
        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson('/api/client-portal/financial');

        $response->assertOk()
            ->assertJsonStructure(['total_shipments', 'total_revenue', 'total_owed', 'cod_collected']);
    }

    public function test_client_can_see_profile(): void
    {
        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson('/api/client-portal/profile');

        $response->assertOk()
            ->assertJsonPath('id', $this->client->id);
    }

    public function test_non_client_user_gets_403(): void
    {
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/client-portal/dashboard');

        $response->assertForbidden();
    }

    public function test_tracking_works_without_auth(): void
    {
        $response = $this->getJson('/api/track?code=DHEPORTAL0001');

        $response->assertOk()
            ->assertJsonPath('found', true)
            ->assertJsonPath('shipment.display_code', '#DHE90001');
    }
}
