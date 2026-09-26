<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Client\Models\ClientAddress;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Una cuenta del portal solo alcanza lo de su empresa, aunque su rol tenga
 * permisos compartidos con el equipo (shipments.view, clients.edit…).
 */
class ClientPortalBoundaryTest extends TestCase
{
    use RefreshDatabase;

    private User $clientUser;

    private User $admin;

    private Client $client;

    private Client $otherClient;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->client = Client::create(['name' => 'Tienda Uno', 'phone' => '3001112233', 'email' => 'uno@tienda.com', 'billing_type' => 'post_sale']);
        $this->otherClient = Client::create(['name' => 'Tienda Dos', 'phone' => '3004445566', 'email' => 'dos@tienda.com', 'billing_type' => 'post_sale']);

        $this->clientUser = User::create([
            'name' => 'Cliente Uno',
            'email' => 'uno@tienda.com',
            'password' => Hash::make('secret123'),
            'client_id' => $this->client->id,
        ]);
        // Como en producción: el rol en los dos guards (UserController / PortalAccessService).
        $this->clientUser->assignRole(Role::where('name', 'client')->whereIn('guard_name', ['web', 'sanctum'])->get());

        $this->admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();

        foreach ([[$this->client, 1], [$this->otherClient, 2]] as [$owner, $n]) {
            Shipment::create([
                'tracking_code' => 'DHEBOUNDARY000'.$n,
                'display_code' => '#DHE8000'.$n,
                'sequence_number' => 80000 + $n,
                'client_id' => $owner->id,
                'created_by' => $this->admin->id,
                'recipient_name' => 'Destinatario '.$n,
                'recipient_phone' => '300000000'.$n,
                'recipient_address' => 'Cl '.$n.' #1-1',
                'recipient_zone' => 'Centro',
                'recipient_city' => 'Bogota',
                'status' => 'registered',
                'payment_type' => 'post_sale',
                'shipping_cost' => 10000,
                'cod_amount' => 0,
                'financial_status' => 'pending',
                'driver_fee' => 3000,
            ]);
        }
    }

    public function test_client_cannot_list_all_shipments_or_clients(): void
    {
        $this->actingAs($this->clientUser, 'sanctum')->getJson('/api/shipments')->assertForbidden();
        $this->actingAs($this->clientUser, 'sanctum')->getJson('/api/clients')->assertForbidden();
        $this->actingAs($this->clientUser, 'sanctum')->getJson('/api/clients/'.$this->otherClient->id)->assertForbidden();
    }

    public function test_client_cannot_create_shipments_from_the_admin_route(): void
    {
        $this->actingAs($this->clientUser, 'sanctum')
            ->postJson('/api/shipments', ['recipient_name' => 'X'])
            ->assertForbidden();
    }

    public function test_client_cannot_edit_another_client(): void
    {
        $this->actingAs($this->clientUser, 'sanctum')
            ->putJson('/api/clients/'.$this->otherClient->id, ['name' => 'Hackeado'])
            ->assertForbidden();

        $this->assertSame('Tienda Dos', $this->otherClient->fresh()->name);
    }

    public function test_client_edits_only_safe_fields_of_its_own_profile(): void
    {
        $this->actingAs($this->clientUser, 'sanctum')
            ->putJson('/api/clients/'.$this->client->id, [
                'name' => 'Tienda Uno SAS',
                'phone' => '3001112233',
                'is_active' => false,
                'notes' => 'cambiado por el cliente',
                'billing_types' => ['prepaid'],
            ])
            ->assertOk();

        $fresh = $this->client->fresh(['paymentTypes']);
        $this->assertSame('Tienda Uno SAS', $fresh->name);
        $this->assertTrue($fresh->is_active);
        $this->assertNull($fresh->notes);
    }

    public function test_client_manages_only_its_own_addresses(): void
    {
        $own = ClientAddress::create(['client_id' => $this->client->id, 'label' => 'Bodega', 'address' => 'Cl 1 #2-3', 'city' => 'Bogota']);
        $foreign = ClientAddress::create(['client_id' => $this->otherClient->id, 'label' => 'Local', 'address' => 'Cl 9 #9-9', 'city' => 'Bogota']);

        $this->actingAs($this->clientUser, 'sanctum')
            ->postJson('/api/clients/'.$this->otherClient->id.'/addresses', ['label' => 'X', 'address' => 'Cl 5'])
            ->assertForbidden();

        $this->actingAs($this->clientUser, 'sanctum')
            ->deleteJson('/api/client-addresses/'.$foreign->id)
            ->assertForbidden();
        $this->assertNotNull($foreign->fresh());

        $this->actingAs($this->clientUser, 'sanctum')
            ->deleteJson('/api/client-addresses/'.$own->id)
            ->assertSuccessful();
    }

    public function test_portal_routes_keep_working(): void
    {
        $this->actingAs($this->clientUser, 'sanctum')->getJson('/api/me')->assertOk();
        $this->actingAs($this->clientUser, 'sanctum')->getJson('/api/client/my-dashboard')->assertOk();
        $this->actingAs($this->clientUser, 'sanctum')->getJson('/api/client-portal/shipments')->assertOk()
            ->assertJsonMissing(['tracking_code' => 'DHEBOUNDARY0002']);
        $this->actingAs($this->clientUser, 'sanctum')->getJson('/api/notifications')->assertOk();
    }

    public function test_staff_is_not_affected(): void
    {
        $this->actingAs($this->admin, 'sanctum')->getJson('/api/shipments')->assertOk();
        $this->actingAs($this->admin, 'sanctum')->getJson('/api/clients')->assertOk();
    }

    public function test_deactivated_account_cannot_log_in_nor_use_its_token(): void
    {
        $token = $this->clientUser->createToken('web-session')->plainTextToken;
        $this->clientUser->forceFill(['active' => false])->save();

        $this->postJson('/api/login', ['email' => 'uno@tienda.com', 'password' => 'secret123'])
            ->assertStatus(422);

        $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
    }

    public function test_login_records_last_access(): void
    {
        $this->postJson('/api/login', ['email' => 'uno@tienda.com', 'password' => 'secret123'])->assertOk();

        $this->assertNotNull($this->clientUser->fresh()->last_login_at);
    }
}
