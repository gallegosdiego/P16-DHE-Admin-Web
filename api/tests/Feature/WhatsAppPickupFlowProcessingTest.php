<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Pickup\Models\CustomerWhatsAppSetting;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Shipment\Models\Shipment;
use App\Integrations\WhatsApp\Enums\WhatsAppCustomerStatus;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContact;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContactPermission;
use App\Integrations\WhatsApp\Models\WhatsAppContact;
use App\Integrations\WhatsApp\Models\WhatsAppFlowSubmission;
use App\Integrations\WhatsApp\Models\WhatsAppLinkRequest;
use App\Integrations\WhatsApp\Services\PickupFlowSubmissionProcessor;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WhatsAppPickupFlowProcessingTest extends TestCase
{
    use RefreshDatabase;

    public function test_authorized_contact_creates_accepted_pickup_from_flow_reply(): void
    {
        config()->set('services.whatsapp.app_secret', 'meta-secret-test');

        $client = Client::query()->create([
            'name' => 'Cliente Uno',
            'phone' => '3001112233',
            'billing_type' => 'cash_on_delivery',
            'is_active' => true,
        ]);

        CustomerWhatsAppSetting::query()->create([
            'customer_id' => $client->id,
            'status' => 'ACTIVE',
            'cod_enabled' => true,
            'automatic_package_limit' => 5,
            'manual_review_package_limit' => 20,
            'automatic_cod_limit' => 500000,
            'manual_review_cod_limit' => 1000000,
            'automatic_cod_total_limit' => 2000000,
            'allowed_windows_json' => ['today_pm'],
        ]);

        $contact = WhatsAppContact::query()->create([
            'wa_id' => '573001112233',
            'phone' => '3001112233',
            'display_name' => 'Maria Lopez',
            'verification_status' => 'VERIFIED',
        ]);

        $link = CustomerWhatsAppContact::query()->create([
            'customer_id' => $client->id,
            'whatsapp_contact_id' => $contact->id,
            'status' => 'AUTHORIZED',
            'authorized_at' => now(),
        ]);

        CustomerWhatsAppContactPermission::query()->create([
            'customer_whatsapp_contact_id' => $link->id,
            'permission' => 'CREATE_PICKUP',
            'created_at' => now(),
        ]);

        $payload = $this->flowWebhookPayload([
            'flow_token' => 'flow-submission-001',
            'pickup_address_line1' => 'Cra 80 #12-35',
            'pickup_zone' => 'Engativa',
            'pickup_city' => 'Bogota',
            'contact_name' => 'Maria Lopez',
            'contact_phone' => '3001112233',
            'pickup_window_code' => 'today_pm',
            'pickup_window_label' => 'Segunda jornada',
            'special_instructions' => 'Llamar al llegar',
            'packages' => [
                [
                    'recipient_name' => 'Ana Perez',
                    'recipient_phone' => '3000000000',
                    'delivery_address_line1' => 'Cl 100 #20-30',
                    'delivery_zone' => 'Usaquen',
                    'delivery_city' => 'Bogota',
                    'is_cod' => true,
                    'requested_cod_amount' => 180000,
                ],
            ],
        ]);

        $response = $this->postSignedWebhook($payload, 'meta-secret-test');

        $response->assertOk()
            ->assertJsonPath('data.accepted', true);

        $this->assertDatabaseCount('pickup_requests', 1);
        $this->assertDatabaseCount('pickup_packages', 1);
        $this->assertDatabaseCount('whatsapp_flow_submissions', 1);

        /** @var PickupRequest $pickup */
        $pickup = PickupRequest::query()->firstOrFail();
        $this->assertSame('accepted', $pickup->status->value);
        $this->assertSame('IN_COVERAGE', $pickup->coverage_status->value);
        $this->assertSame(180000, $pickup->requested_cod_total);

        /** @var WhatsAppFlowSubmission $submission */
        $submission = WhatsAppFlowSubmission::query()->firstOrFail();
        $this->assertSame('PROCESSED', $submission->status->value);
        $this->assertSame($pickup->id, $submission->pickup_request_id);
    }

    public function test_flow_reply_goes_to_pending_review_when_package_limit_is_exceeded(): void
    {
        config()->set('services.whatsapp.app_secret', 'meta-secret-test');

        $client = Client::query()->create([
            'name' => 'Cliente Dos',
            'phone' => '3001112244',
            'billing_type' => 'cash_on_delivery',
            'is_active' => true,
        ]);

        CustomerWhatsAppSetting::query()->create([
            'customer_id' => $client->id,
            'status' => 'ACTIVE',
            'cod_enabled' => true,
            'automatic_package_limit' => 1,
            'manual_review_package_limit' => 20,
            'automatic_cod_limit' => 500000,
            'manual_review_cod_limit' => 1000000,
            'automatic_cod_total_limit' => 2000000,
            'allowed_windows_json' => ['today_pm'],
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

        CustomerWhatsAppContactPermission::query()->create([
            'customer_whatsapp_contact_id' => $link->id,
            'permission' => 'CREATE_PICKUP',
            'created_at' => now(),
        ]);

        $payload = $this->flowWebhookPayload(
            [
                'flow_token' => 'flow-submission-002',
                'pickup_address_line1' => 'Cra 50 #45-20',
                'pickup_zone' => 'Chapinero',
                'pickup_city' => 'Bogota',
                'contact_name' => 'Carlos Mesa',
                'contact_phone' => '3001112244',
                'pickup_window_code' => 'today_pm',
                'pickup_window_label' => 'Segunda jornada',
                'packages' => [
                    [
                        'recipient_name' => 'Destinatario 1',
                        'recipient_phone' => '3010000001',
                        'delivery_address_line1' => 'Cl 1 #1-01',
                        'delivery_city' => 'Bogota',
                        'is_cod' => false,
                    ],
                    [
                        'recipient_name' => 'Destinatario 2',
                        'recipient_phone' => '3010000002',
                        'delivery_address_line1' => 'Cl 2 #2-02',
                        'delivery_city' => 'Bogota',
                        'is_cod' => false,
                    ],
                ],
            ],
            '573001112244',
        );

        $response = $this->postSignedWebhook($payload, 'meta-secret-test');

        $response->assertOk();

        /** @var PickupRequest $pickup */
        $pickup = PickupRequest::query()->firstOrFail();
        $this->assertSame('pending_review', $pickup->status->value);
        $this->assertSame('PICKUP_PACKAGE_LIMIT_EXCEEDED', $pickup->review_reason_code);
        $this->assertDatabaseCount('pickup_review_events', 1);
    }

    public function test_unauthorized_contact_creates_link_request_instead_of_pickup(): void
    {
        config()->set('services.whatsapp.app_secret', 'meta-secret-test');

        $client = Client::query()->create([
            'name' => 'Cliente Tres',
            'phone' => '3001112255',
            'billing_type' => 'cash_on_delivery',
            'is_active' => true,
        ]);

        $payload = $this->flowWebhookPayload([
            'flow_token' => 'flow-submission-003',
            'customer_id' => $client->id,
            'customer_name' => $client->name,
            'pickup_address_line1' => 'Cra 10 #10-10',
            'pickup_city' => 'Bogota',
            'contact_name' => 'Nuevo Usuario',
            'contact_phone' => '3001112255',
            'packages' => [
                [
                    'recipient_name' => 'Ana Perez',
                    'recipient_phone' => '3000000000',
                    'delivery_address_line1' => 'Cl 100 #20-30',
                    'delivery_city' => 'Bogota',
                    'is_cod' => false,
                ],
            ],
        ], '573001119999');

        $response = $this->postSignedWebhook($payload, 'meta-secret-test');

        $response->assertOk();

        $this->assertDatabaseCount('pickup_requests', 0);
        $this->assertDatabaseCount('whatsapp_link_requests', 1);

        /** @var WhatsAppLinkRequest $linkRequest */
        $linkRequest = WhatsAppLinkRequest::query()->firstOrFail();
        $this->assertSame('PENDING', $linkRequest->status->value);
        $this->assertSame($client->id, $linkRequest->requested_customer_id);

        /** @var WhatsAppFlowSubmission $submission */
        $submission = WhatsAppFlowSubmission::query()->firstOrFail();
        $this->assertSame('FAILED', $submission->status->value);
    }

    public function test_customer_visible_status_includes_delivery_confirmation(): void
    {
        $client = Client::query()->create([
            'name' => 'Cliente Cuatro',
            'phone' => '3001112266',
            'billing_type' => 'cash_on_delivery',
            'is_active' => true,
        ]);

        $pickup = PickupRequest::query()->create([
            'pickup_code' => 'PK-TEST-001',
            'customer_id' => $client->id,
            'source' => 'whatsapp',
            'status' => 'accepted',
            'pickup_address_line1' => 'Cra 1 #1-1',
            'coverage_status' => 'IN_COVERAGE',
            'contact_name' => 'Cliente Cuatro',
            'contact_phone' => '3001112266',
            'pickup_window_code' => 'today_pm',
            'pickup_window_label' => 'Segunda jornada',
            'package_count' => 1,
            'requested_cod_total' => 0,
            'correlation_id' => 'wa_evt_test',
            'submitted_at' => now(),
            'accepted_at' => now(),
        ]);

        $user = User::factory()->create();

        $shipment = Shipment::query()->create([
            'tracking_code' => 'DHE2026070700001',
            'display_code' => '#DHE00001',
            'sequence_number' => 1,
            'client_id' => $client->id,
            'created_by' => $user->id,
            'recipient_name' => 'Ana Perez',
            'recipient_phone' => '3000000000',
            'recipient_address' => 'Cl 100 #20-30',
            'recipient_city' => 'Bogota',
            'status' => 'delivered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => 0,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
            'delivered_at' => now(),
        ]);

        $status = app(PickupFlowSubmissionProcessor::class)
            ->resolveCustomerVisibleStatus($pickup, $shipment);

        $this->assertSame(WhatsAppCustomerStatus::DELIVERY_CONFIRMED, $status);
        $this->assertSame('Entrega confirmada', $status->label());
    }

    /**
     * @param array<string, mixed> $response
     * @return array<string, mixed>
     */
    private function flowWebhookPayload(array $response, string $waId = '573001112233'): array
    {
        return [
            'entry' => [
                [
                    'changes' => [
                        [
                            'value' => [
                                'contacts' => [
                                    [
                                        'wa_id' => $waId,
                                        'profile' => [
                                            'name' => 'Flow User',
                                        ],
                                    ],
                                ],
                                'messages' => [
                                    [
                                        'id' => 'wamid.flow.'.($response['flow_token'] ?? '001'),
                                        'from' => $waId,
                                        'type' => 'interactive',
                                        'interactive' => [
                                            'type' => 'nfm_reply',
                                            'nfm_reply' => [
                                                'name' => 'pickup_request',
                                                'response_json' => json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ];
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function postSignedWebhook(array $payload, string $secret)
    {
        $content = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $signature = 'sha256='.hash_hmac('sha256', $content, $secret);

        return $this->call(
            'POST',
            '/api/integrations/whatsapp/webhook',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_X_HUB_SIGNATURE_256' => $signature,
            ],
            $content,
        );
    }
}
