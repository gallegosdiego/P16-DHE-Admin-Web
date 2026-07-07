<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Integrations\WhatsApp\Enums\WebhookProcessingStatus;
use App\Integrations\WhatsApp\Jobs\ProcessWhatsAppWebhookInbox;
use App\Integrations\WhatsApp\Models\WhatsAppWebhookInbox;
use App\Integrations\WhatsApp\Services\MetaWebhookEventIdExtractor;
use App\Integrations\WhatsApp\Services\WebhookSignatureValidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use JsonException;

class WhatsAppWebhookController extends Controller
{
    public function verify(Request $request): JsonResponse|\Illuminate\Http\Response
    {
        $mode = (string) $request->query('hub_mode', '');
        $verifyToken = (string) $request->query('hub_verify_token', '');
        $challenge = (string) $request->query('hub_challenge', '');
        $expectedToken = trim((string) config('services.whatsapp.verify_token', ''));

        if ($mode === 'subscribe' && $expectedToken !== '' && hash_equals($expectedToken, $verifyToken)) {
            return response($challenge, 200, ['Content-Type' => 'text/plain']);
        }

        return response()->json([
            'success' => false,
            'data' => null,
            'meta' => [],
            'errors' => [
                [
                    'code' => 'WEBHOOK_VERIFICATION_FAILED',
                    'message' => 'Webhook verification failed.',
                ],
            ],
        ], 403);
    }

    public function handle(
        Request $request,
        WebhookSignatureValidator $signatureValidator,
        MetaWebhookEventIdExtractor $eventIdExtractor,
    ): JsonResponse {
        $rawPayload = $request->getContent();
        $signature = $request->header('X-Hub-Signature-256');

        if (! $signatureValidator->validate($rawPayload, is_string($signature) ? $signature : null)) {
            return response()->json([
                'success' => false,
                'data' => null,
                'meta' => [],
                'errors' => [
                    [
                        'code' => 'WEBHOOK_SIGNATURE_INVALID',
                        'message' => 'Invalid webhook signature.',
                    ],
                ],
            ], 403);
        }

        try {
            /** @var array<string, mixed> $payload */
            $payload = json_decode($rawPayload, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return response()->json([
                'success' => false,
                'data' => null,
                'meta' => [],
                'errors' => [
                    [
                        'code' => 'WEBHOOK_INVALID_JSON',
                        'message' => 'Invalid webhook payload.',
                    ],
                ],
            ], 422);
        }

        $externalEventId = $eventIdExtractor->extract($payload);
        $payloadHash = hash('sha256', $rawPayload);

        $existing = WhatsAppWebhookInbox::query()
            ->when(
                $externalEventId !== null,
                fn ($query) => $query->where('provider', 'meta')->where('external_event_id', $externalEventId),
                fn ($query) => $query->where('provider', 'meta')->where('payload_hash', $payloadHash)
            )
            ->first();

        if ($existing) {
            return response()->json([
                'success' => true,
                'data' => [
                    'accepted' => true,
                    'duplicate' => true,
                ],
                'meta' => [
                    'correlation_id' => $existing->correlation_id,
                ],
                'errors' => [],
            ]);
        }

        $correlationId = 'wa_evt_'.str()->lower((string) str()->ulid());

        $inbox = WhatsAppWebhookInbox::query()->create([
            'provider' => 'meta',
            'external_event_id' => $externalEventId,
            'event_type' => $this->detectEventType($payload),
            'payload_hash' => $payloadHash,
            'signature_valid' => true,
            'processing_status' => WebhookProcessingStatus::QUEUED,
            'received_at' => now(),
            'correlation_id' => $correlationId,
            'payload_json' => $payload,
            'headers_json' => [
                'x_hub_signature_256' => $signature,
            ],
        ]);

        ProcessWhatsAppWebhookInbox::dispatch($inbox->id);

        return response()->json([
            'success' => true,
            'data' => [
                'accepted' => true,
            ],
            'meta' => [
                'correlation_id' => $correlationId,
            ],
            'errors' => [],
        ]);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function detectEventType(array $payload): string
    {
        foreach (($payload['entry'] ?? []) as $entry) {
            foreach (($entry['changes'] ?? []) as $change) {
                $value = $change['value'] ?? [];

                if (! empty($value['messages'])) {
                    return 'message';
                }

                if (! empty($value['statuses'])) {
                    return 'status';
                }
            }
        }

        return 'unknown';
    }
}
