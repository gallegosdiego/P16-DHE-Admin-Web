<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
