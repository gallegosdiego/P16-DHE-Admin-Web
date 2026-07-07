<?php

namespace App\Integrations\WhatsApp\Jobs;

use App\Integrations\WhatsApp\Models\WhatsAppMessage;
use App\Integrations\WhatsApp\Services\MetaCloudWhatsAppClient;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class SendWhatsAppMessage implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(
        public int $messageId,
    ) {
    }

    public function handle(MetaCloudWhatsAppClient $client): void
    {
        $message = WhatsAppMessage::query()->with('whatsappContact')->find($this->messageId);

        if (! $message || $message->direction !== 'outbound') {
            return;
        }

        if (in_array((string) $message->message_status, ['accepted', 'sent', 'delivered', 'read', 'simulated'], true)) {
            return;
        }

        $payload = $message->payload_json ?? [];
        $to = trim((string) ($payload['to'] ?? $message->whatsappContact?->wa_id ?? ''));
        $text = trim((string) ($payload['text'] ?? ''));

        if ($to === '' || $text === '') {
            $this->markFailure($message, $payload, 'INVALID_OUTBOUND_MESSAGE', 'Missing recipient or text payload.');

            return;
        }

        if (! (bool) config('whatsapp_pickups.outbound_enabled', false)) {
            $message->forceFill([
                'message_status' => 'simulated',
                'sent_at' => $message->sent_at ?? now(),
                'payload_json' => $this->mergePayload($payload, [
                    'dispatch_mode' => 'simulated',
                    'simulated_at' => now()->toISOString(),
                ]),
            ])->save();

            return;
        }

        try {
            $response = $client->sendTextMessage($to, $text);
            $providerMessageId = (string) data_get($response, 'messages.0.id', '');

            $message->forceFill([
                'provider_message_id' => $providerMessageId !== '' ? $providerMessageId : $message->provider_message_id,
                'message_status' => 'accepted',
                'sent_at' => $message->sent_at ?? now(),
                'payload_json' => $this->mergePayload($payload, [
                    'dispatch_mode' => 'live',
                    'provider_response' => $response,
                ]),
            ])->save();
        } catch (Throwable $exception) {
            $this->markFailure(
                $message,
                $payload,
                'OUTBOUND_SEND_FAILED',
                $exception->getMessage()
            );

            throw $exception;
        }
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function markFailure(WhatsAppMessage $message, array $payload, string $code, string $messageText): void
    {
        $message->forceFill([
            'message_status' => 'failed',
            'payload_json' => $this->mergePayload($payload, [
                'last_error' => [
                    'code' => $code,
                    'message' => $messageText,
                    'failed_at' => now()->toISOString(),
                ],
            ]),
        ])->save();
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $updates
     * @return array<string, mixed>
     */
    private function mergePayload(array $payload, array $updates): array
    {
        return array_replace_recursive($payload, $updates);
    }
}
