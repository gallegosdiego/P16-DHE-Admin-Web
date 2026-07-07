<?php

namespace Tests\Feature;

use App\Integrations\WhatsApp\Models\WhatsAppMessage;
use App\Integrations\WhatsApp\Models\WhatsAppWebhookInbox;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WhatsAppWebhookTest extends TestCase
{
    use RefreshDatabase;

    public function test_webhook_verification_returns_challenge_when_token_matches(): void
    {
        config()->set('services.whatsapp.verify_token', 'verify-token-test');

        $response = $this->get('/api/integrations/whatsapp/webhook?hub_mode=subscribe&hub_verify_token=verify-token-test&hub_challenge=12345');

        $response->assertOk();
        $response->assertSeeText('12345');
    }

    public function test_webhook_verification_rejects_invalid_token(): void
    {
        config()->set('services.whatsapp.verify_token', 'verify-token-test');

        $response = $this->getJson('/api/integrations/whatsapp/webhook?hub_mode=subscribe&hub_verify_token=wrong&hub_challenge=12345');

        $response->assertForbidden()
            ->assertJsonPath('errors.0.code', 'WEBHOOK_VERIFICATION_FAILED');
    }

    public function test_webhook_rejects_invalid_signature(): void
    {
        config()->set('services.whatsapp.app_secret', 'meta-secret-test');

        $payload = [
            'entry' => [
                [
                    'changes' => [
                        [
                            'value' => [
                                'messages' => [
                                    ['id' => 'wamid.001'],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ];
        $content = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $response = $this->call(
            'POST',
            '/api/integrations/whatsapp/webhook',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_X_HUB_SIGNATURE_256' => 'sha256=invalid',
            ],
            $content,
        );

        $response->assertForbidden()
            ->assertJsonPath('errors.0.code', 'WEBHOOK_SIGNATURE_INVALID');

        $this->assertDatabaseCount('whatsapp_webhook_inbox', 0);
    }

    public function test_webhook_persists_and_processes_valid_event_idempotently(): void
    {
        config()->set('services.whatsapp.app_secret', 'meta-secret-test');

        $payload = [
            'entry' => [
                [
                    'changes' => [
                        [
                            'value' => [
                                'messages' => [
                                    ['id' => 'wamid.001'],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ];
        $content = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $signature = 'sha256='.hash_hmac('sha256', $content, 'meta-secret-test');

        $first = $this->call(
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

        $first->assertOk()
            ->assertJsonPath('data.accepted', true);

        $this->assertDatabaseCount('whatsapp_webhook_inbox', 1);

        /** @var WhatsAppWebhookInbox $inbox */
        $inbox = WhatsAppWebhookInbox::query()->firstOrFail();
        $this->assertTrue($inbox->signature_valid);
        $this->assertSame('meta', $inbox->provider);
        $this->assertSame('wamid.001', $inbox->external_event_id);
        $this->assertSame('IGNORED', $inbox->processing_status->value);
        $this->assertNotNull($inbox->processed_at);

        $second = $this->call(
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

        $second->assertOk()
            ->assertJsonPath('data.duplicate', true);

        $this->assertDatabaseCount('whatsapp_webhook_inbox', 1);
    }

    public function test_webhook_processes_provider_status_updates_for_outbound_messages(): void
    {
        config()->set('services.whatsapp.app_secret', 'meta-secret-test');

        $message = WhatsAppMessage::query()->create([
            'direction' => 'outbound',
            'provider_message_id' => 'wamid.outbound.001',
            'message_type' => 'accepted',
            'message_status' => 'accepted',
            'correlation_id' => 'wa_pickup_status_test',
            'payload_json' => [
                'notification_type' => 'accepted',
                'text' => 'Danhei: tu solicitud fue aceptada.',
                'to' => '573001112233',
            ],
            'sent_at' => now(),
        ]);

        $payload = [
            'entry' => [
                [
                    'changes' => [
                        [
                            'value' => [
                                'statuses' => [
                                    [
                                        'id' => 'wamid.outbound.001',
                                        'status' => 'delivered',
                                        'timestamp' => (string) now()->timestamp,
                                        'recipient_id' => '573001112233',
                                        'conversation' => [
                                            'id' => 'conversation-001',
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ];

        $content = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $signature = 'sha256='.hash_hmac('sha256', $content, 'meta-secret-test');

        $response = $this->call(
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

        $response->assertOk()
            ->assertJsonPath('data.accepted', true);

        $this->assertDatabaseHas('whatsapp_messages', [
            'id' => $message->id,
            'message_status' => 'delivered',
        ]);

        /** @var WhatsAppMessage $freshMessage */
        $freshMessage = $message->fresh();
        $this->assertNotNull($freshMessage?->received_at);
        $this->assertSame(
            'delivered',
            data_get($freshMessage?->payload_json, 'provider_status_event.status')
        );

        /** @var WhatsAppWebhookInbox $inbox */
        $inbox = WhatsAppWebhookInbox::query()->latest('id')->firstOrFail();
        $this->assertSame('PROCESSED', $inbox->processing_status->value);
    }
}
