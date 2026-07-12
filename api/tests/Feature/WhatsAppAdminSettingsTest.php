<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Client\Models\ClientAddress;
use App\Domain\Pickup\Models\CustomerWhatsAppSetting;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContact;
use App\Integrations\WhatsApp\Models\WhatsAppContact;
use App\Integrations\WhatsApp\Models\WhatsAppLinkRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WhatsAppAdminSettingsTest extends TestCase
{
    use RefreshDatabase;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('whatsapp_pickups.admin_ui_enabled', true);
        $this->seed();

        $response = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ]);

        $this->token = $response->json('token');
    }

    public function test_can_get_default_whatsapp_settings_for_a_client(): void
    {
        $client = Client::query()->create([
            'name' => 'Cliente Admin',
            'billing_type' => 'cash_on_delivery',
            'is_active' => true,
        ]);

        $response = $this->getJson("/api/clients/{$client->id}/whatsapp-settings", $this->auth());

        $response->assertOk()
            ->assertJsonPath('customer_id', $client->id)
            ->assertJsonPath('status', 'DISABLED')
            ->assertJsonPath('contacts', []);
    }

    public function test_can_update_whatsapp_settings_for_a_client(): void
    {
        $client = Client::query()->create([
            'name' => 'Cliente Config',
            'billing_type' => 'cash_on_delivery',
            'is_active' => true,
        ]);

        $address = ClientAddress::query()->create([
            'client_id' => $client->id,
            'label' => 'Bodega Principal',
            'address' => 'Cra 80 #12-35',
            'zone' => 'Engativa',
            'city' => 'Bogota',
            'is_default' => true,
        ]);

        $response = $this->putJson("/api/clients/{$client->id}/whatsapp-settings", [
            'status' => 'ACTIVE',
            'cod_enabled' => true,
            'automatic_package_limit' => 5,
            'manual_review_package_limit' => 20,
            'automatic_cod_limit' => 500000,
            'manual_review_cod_limit' => 1000000,
            'automatic_cod_total_limit' => 2000000,
            'allowed_windows' => ['today_am', 'today_pm'],
            'default_pickup_address_id' => $address->id,
        ], $this->auth());

        $response->assertOk()
            ->assertJsonPath('status', 'ACTIVE')
            ->assertJsonPath('cod_enabled', true)
            ->assertJsonPath('default_pickup_address_id', $address->id);

        $this->assertDatabaseHas('customer_whatsapp_settings', [
            'customer_id' => $client->id,
            'status' => 'ACTIVE',
            'default_pickup_address_id' => $address->id,
        ]);
    }

    public function test_can_create_authorized_whatsapp_contact_for_a_client(): void
    {
        $client = Client::query()->create([
            'name' => 'Cliente Contacto',
            'billing_type' => 'cash_on_delivery',
            'is_active' => true,
        ]);

        $response = $this->postJson("/api/clients/{$client->id}/whatsapp-contacts", [
            'wa_id' => '573001112233',
            'phone' => '3001112233',
            'display_name' => 'Maria Lopez',
            'role' => 'operaciones',
            'permissions' => ['CREATE_PICKUP', 'VIEW_OWN_PICKUPS'],
        ], $this->auth());

        $response->assertCreated()
            ->assertJsonPath('customer_id', $client->id)
            ->assertJsonPath('status', 'AUTHORIZED');

        $this->assertDatabaseHas('whatsapp_contacts', [
            'wa_id' => '573001112233',
            'phone' => '3001112233',
        ]);

        $this->assertDatabaseHas('customer_whatsapp_contacts', [
            'customer_id' => $client->id,
            'status' => 'AUTHORIZED',
        ]);
    }

    public function test_can_suspend_authorized_whatsapp_contact(): void
    {
        $client = Client::query()->create([
            'name' => 'Cliente Suspender',
            'billing_type' => 'cash_on_delivery',
            'is_active' => true,
        ]);

        $contact = WhatsAppContact::query()->create([
            'wa_id' => '573001112244',
            'phone' => '3001112244',
            'display_name' => 'Carlos Mesa',
            'verification_status' => 'VERIFIED',
        ]);

        $link = CustomerWhatsAppContact::query()->create([
            'customer_id' => $client->id,
            'whatsapp_contact_id' => $contact->id,
            'status' => 'AUTHORIZED',
            'authorized_at' => now(),
        ]);

        $response = $this->postJson("/api/clients/{$client->id}/whatsapp-contacts/{$link->id}/suspend", [], $this->auth());

        $response->assertOk()
            ->assertJsonPath('contact.status', 'SUSPENDED');

        $this->assertDatabaseHas('customer_whatsapp_contacts', [
            'id' => $link->id,
            'status' => 'SUSPENDED',
        ]);
    }

    public function test_can_list_and_approve_whatsapp_link_request(): void
    {
        $client = Client::query()->create([
            'name' => 'Cliente Vinculacion',
            'billing_type' => 'cash_on_delivery',
            'is_active' => true,
        ]);

        $contact = WhatsAppContact::query()->create([
            'wa_id' => '573001119999',
            'phone' => '3001119999',
            'display_name' => 'Nuevo Contacto',
            'verification_status' => 'KNOWN',
        ]);

        $linkRequest = WhatsAppLinkRequest::query()->create([
            'whatsapp_contact_id' => $contact->id,
            'requested_customer_id' => $client->id,
            'requested_company_name' => $client->name,
            'status' => 'PENDING',
            'requested_by_phone' => '3001119999',
        ]);

        $list = $this->getJson('/api/whatsapp/link-requests?status=PENDING', $this->auth());

        $list->assertOk();
        $this->assertSame($linkRequest->id, $list->json('data.0.id'));

        $approve = $this->postJson("/api/whatsapp/link-requests/{$linkRequest->id}/approve", [
            'permissions' => ['CREATE_PICKUP', 'USE_SAVED_ADDRESSES'],
        ], $this->auth());

        $approve->assertOk()
            ->assertJsonPath('status', 'APPROVED')
            ->assertJsonPath('requested_customer_id', $client->id);

        $this->assertDatabaseHas('customer_whatsapp_contacts', [
            'customer_id' => $client->id,
            'whatsapp_contact_id' => $contact->id,
            'status' => 'AUTHORIZED',
        ]);
    }

    private function auth(): array
    {
        return ['Authorization' => "Bearer {$this->token}"];
    }
}
