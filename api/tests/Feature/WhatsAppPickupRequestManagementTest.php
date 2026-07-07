<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Pickup\Models\PickupRequest;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContact;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContactPermission;
use App\Integrations\WhatsApp\Models\WhatsAppContact;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WhatsAppPickupRequestManagementTest extends TestCase
{
    use RefreshDatabase;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $response = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ]);

        $this->token = $response->json('token');
    }

    public function test_can_list_pickup_requests_and_view_customer_visible_status(): void
    {
        $pickupRequest = $this->createPickupRequest('pending_review');

        $response = $this->getJson('/api/pickup-requests?status=pending_review', $this->auth());

        $response->assertOk()
            ->assertJsonPath('data.0.id', $pickupRequest->id)
            ->assertJsonPath('data.0.customer_visible_status', 'pending_review')
            ->assertJsonPath('summary.pending_review', 1);
    }

    public function test_can_request_customer_input_for_a_pickup_request(): void
    {
        $pickupRequest = $this->createPickupRequest('pending_review');

        $response = $this->postJson("/api/pickup-requests/{$pickupRequest->id}/request-input", [
            'reason_code' => 'MISSING_DESTINATION_REFERENCE',
            'notes' => 'Falta referencia de la direccion de entrega.',
            'requested_fields' => ['delivery_address_line1', 'recipient_phone'],
        ], $this->auth());

        $response->assertOk()
            ->assertJsonPath('status', 'needs_customer_input')
            ->assertJsonPath('review_reason_code', 'MISSING_DESTINATION_REFERENCE')
            ->assertJsonPath('review_events.0.requested_fields.0', 'delivery_address_line1');

        $this->assertDatabaseHas('pickup_requests', [
            'id' => $pickupRequest->id,
            'status' => 'needs_customer_input',
        ]);
        $this->assertDatabaseHas('pickup_review_events', [
            'pickup_request_id' => $pickupRequest->id,
            'event_type' => 'CUSTOMER_INPUT_REQUESTED',
        ]);
    }

    public function test_can_approve_and_materialize_shipments_from_pickup_request(): void
    {
        $pickupRequest = $this->createPickupRequest('pending_review');

        $approve = $this->postJson("/api/pickup-requests/{$pickupRequest->id}/approve", [
            'notes' => 'Cobertura validada por operaciones.',
        ], $this->auth());

        $approve->assertOk()
            ->assertJsonPath('status', 'accepted');

        $materialize = $this->postJson("/api/pickup-requests/{$pickupRequest->id}/materialize-shipments", [
            'default_shipping_cost' => 12500,
            'default_driver_fee' => 3500,
        ], $this->auth());

        $materialize->assertOk()
            ->assertJsonPath('pickup_request.status', 'ready_for_assignment')
            ->assertJsonPath('pickup_request.shipments_summary.materialized_packages', 1)
            ->assertJsonPath('pickup_request.packages.0.shipment.status', 'pickup_scheduled');

        $this->assertDatabaseHas('shipments', [
            'client_id' => $pickupRequest->customer_id,
            'recipient_name' => 'Ana Perez',
            'status' => 'pickup_scheduled',
            'shipping_cost' => 12500,
            'driver_fee' => 3500,
        ]);
        $this->assertDatabaseHas('pickup_packages', [
            'pickup_request_id' => $pickupRequest->id,
        ]);
    }

    public function test_can_cancel_pickup_request_before_materialization(): void
    {
        $pickupRequest = $this->createPickupRequest('pending_review');

        $response = $this->postJson("/api/pickup-requests/{$pickupRequest->id}/cancel", [
            'reason_code' => 'CUSTOMER_CANCELLED',
            'notes' => 'Cliente pidio cancelar la solicitud.',
        ], $this->auth());

        $response->assertOk()
            ->assertJsonPath('status', 'cancelled');

        $this->assertDatabaseHas('pickup_requests', [
            'id' => $pickupRequest->id,
            'status' => 'cancelled',
            'review_reason_code' => 'CUSTOMER_CANCELLED',
        ]);
    }

    private function createPickupRequest(string $status): PickupRequest
    {
        $client = Client::query()->create([
            'name' => 'Cliente Recogidas',
            'phone' => '3001112200',
            'billing_type' => 'post_sale',
            'is_active' => true,
        ]);

        $contact = WhatsAppContact::query()->create([
            'wa_id' => '573001110000',
            'phone' => '3001110000',
            'display_name' => 'Ana Operaciones',
            'verification_status' => 'VERIFIED',
        ]);

        $link = CustomerWhatsAppContact::query()->create([
            'customer_id' => $client->id,
            'whatsapp_contact_id' => $contact->id,
            'role' => 'operaciones',
            'status' => 'AUTHORIZED',
            'authorized_at' => now(),
        ]);

        CustomerWhatsAppContactPermission::query()->create([
            'customer_whatsapp_contact_id' => $link->id,
            'permission' => 'CREATE_PICKUP',
            'created_at' => now(),
        ]);

        $pickupRequest = PickupRequest::query()->create([
            'pickup_code' => 'PK-TEST-'.strtoupper(fake()->bothify('###???')),
            'customer_id' => $client->id,
            'customer_whatsapp_contact_id' => $link->id,
            'source' => 'whatsapp',
            'status' => $status,
            'review_reason_code' => $status === 'pending_review' ? 'PICKUP_PACKAGE_LIMIT_EXCEEDED' : null,
            'pickup_address_line1' => 'Cra 80 #12-35',
            'pickup_zone' => 'Engativa',
            'pickup_city' => 'Bogota',
            'coverage_status' => 'IN_COVERAGE',
            'contact_name' => 'Ana Operaciones',
            'contact_phone' => '3001110000',
            'pickup_window_code' => 'today_pm',
            'pickup_window_label' => 'Segunda jornada',
            'package_count' => 1,
            'requested_cod_total' => 180000,
            'special_instructions' => 'Llamar antes de subir.',
            'correlation_id' => fake()->uuid(),
            'submitted_at' => now(),
        ]);

        PickupPackage::query()->create([
            'pickup_request_id' => $pickupRequest->id,
            'package_index' => 1,
            'recipient_name' => 'Ana Perez',
            'recipient_phone' => '3002223344',
            'delivery_address_line1' => 'Cl 100 #20-30',
            'delivery_zone' => 'Usaquen',
            'delivery_city' => 'Bogota',
            'is_cod' => true,
            'requested_cod_amount' => 180000,
            'is_fragile' => false,
        ]);

        return $pickupRequest;
    }

    private function auth(): array
    {
        return ['Authorization' => "Bearer {$this->token}"];
    }
}
