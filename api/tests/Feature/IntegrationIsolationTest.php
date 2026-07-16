<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Pickup\Models\PickupRequest;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContact;
use App\Integrations\WhatsApp\Models\WhatsAppContact;
use App\Integrations\WhatsApp\Services\WhatsAppSchema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class IntegrationIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_whatsapp_webhook_is_not_available_when_inbound_is_disabled(): void
    {
        config()->set('whatsapp_pickups.inbound_enabled', false);

        $this->getJson('/api/integrations/whatsapp/webhook')
            ->assertNotFound()
            ->assertJsonPath('code', 'integration_disabled');
    }

    public function test_whatsapp_admin_endpoints_are_not_available_when_admin_ui_is_disabled(): void
    {
        config()->set('whatsapp_pickups.admin_ui_enabled', false);
        $this->seed();

        $login = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ])->assertOk();

        $this->getJson('/api/whatsapp/link-requests', [
            'Authorization' => 'Bearer '.$login->json('token'),
        ])->assertNotFound()
            ->assertJsonPath('code', 'integration_disabled');
    }

    public function test_generic_pickup_endpoints_remain_available_when_whatsapp_is_disabled(): void
    {
        config()->set('whatsapp_pickups.inbound_enabled', false);
        config()->set('whatsapp_pickups.admin_ui_enabled', false);
        $this->seed();

        $login = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ])->assertOk();

        $this->getJson('/api/pickup-requests', [
            'Authorization' => 'Bearer '.$login->json('token'),
        ])->assertOk();
    }

    public function test_generic_pickup_endpoints_remain_available_without_whatsapp_tables(): void
    {
        config()->set('whatsapp_pickups.inbound_enabled', false);
        config()->set('whatsapp_pickups.admin_ui_enabled', false);
        $this->seed();

        $client = Client::query()->firstOrFail();
        $contact = WhatsAppContact::query()->create([
            'wa_id' => '573001119999',
            'phone' => '3001119999',
            'display_name' => 'Contacto histórico',
            'verification_status' => 'VERIFIED',
        ]);
        $contactLink = CustomerWhatsAppContact::query()->create([
            'customer_id' => $client->id,
            'whatsapp_contact_id' => $contact->id,
            'status' => 'AUTHORIZED',
        ]);
        $pickup = PickupRequest::query()->create([
            'pickup_code' => 'PK-ISOLATION-001',
            'customer_id' => $client->id,
            'customer_whatsapp_contact_id' => $contactLink->id,
            'source' => 'whatsapp',
            'intake_mode' => 'pickup_at_client_location',
            'status' => 'pending_review',
            'pickup_address_line1' => 'Calle 13 # 10-18',
            'pickup_city' => 'Bogotá',
            'coverage_status' => 'IN_COVERAGE',
            'contact_name' => 'Contacto de prueba',
            'contact_phone' => '3001112233',
            'pickup_window_code' => 'today_pm',
            'pickup_window_label' => 'Segunda jornada',
            'package_count' => 1,
            'requested_cod_total' => 0,
            'correlation_id' => 'integration-isolation-001',
            'submitted_at' => now(),
        ]);
        PickupPackage::query()->create([
            'pickup_request_id' => $pickup->id,
            'package_index' => 1,
            'recipient_name' => 'Destinatario',
            'recipient_phone' => '3002223344',
            'delivery_address_line1' => 'Carrera 7 # 20-10',
            'delivery_city' => 'Bogotá',
            'is_cod' => false,
            'is_fragile' => false,
        ]);

        Schema::disableForeignKeyConstraints();
        foreach ([
            'whatsapp_flow_submissions',
            'whatsapp_messages',
            'whatsapp_webhook_inbox',
            'whatsapp_link_requests',
            'customer_whatsapp_contact_permissions',
            'customer_whatsapp_contacts',
            'whatsapp_contacts',
            'customer_whatsapp_settings',
        ] as $table) {
            Schema::dropIfExists($table);
        }
        Schema::enableForeignKeyConstraints();

        $login = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ])->assertOk();
        $headers = ['Authorization' => 'Bearer '.$login->json('token')];

        $this->getJson('/api/pickup-requests', $headers)
            ->assertOk()
            ->assertJsonPath('data.0.id', $pickup->id)
            ->assertJsonPath('data.0.whatsapp_contact', null);

        $this->getJson("/api/pickup-requests/{$pickup->id}", $headers)
            ->assertOk()
            ->assertJsonPath('whatsapp_contact', null)
            ->assertJsonCount(0, 'whatsapp_messages');

        $this->postJson("/api/pickup-requests/{$pickup->id}/approve", [], $headers)
            ->assertOk()
            ->assertJsonPath('status', 'accepted')
            ->assertJsonPath('whatsapp_contact', null)
            ->assertJsonCount(0, 'whatsapp_messages');
    }

    public function test_whatsapp_capability_rejects_a_partial_message_table(): void
    {
        $this->assertTrue(app(WhatsAppSchema::class)->supportsPickupMessages());

        Schema::table('whatsapp_messages', function (Blueprint $table): void {
            $table->dropColumn('payload_json');
        });

        $this->assertFalse((new WhatsAppSchema)->supportsPickupMessages());
        $this->assertFalse((new WhatsAppSchema)->supportsPickupNotifications());
    }
}
