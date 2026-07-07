<?php

namespace App\Integrations\WhatsApp\Services;

use App\Integrations\WhatsApp\Models\WhatsAppMessage;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;

class WhatsAppDeliveryStatusUpdater
{
    /**
     * @param array{
     *     provider_message_id:string,
     *     status:string,
     *     recipient_id:?string,
     *     occurred_at:?string,
     *     conversation_id:?string,
     *     raw:array<string, mixed>
     * } $event
     */
    public function apply(array $event): void
    {
        $message = WhatsAppMessage::query()
            ->where('provider_message_id', $event['provider_message_id'])
            ->first();

        if (! $message) {
            return;
        }

        $payload = $message->payload_json ?? [];
        $occurredAt = $this->parseTimestamp($event['occurred_at'] ?? null);

        $updates = [
            'message_status' => $event['status'],
            'payload_json' => array_replace_recursive($payload, [
                'provider_status_event' => [
                    'status' => $event['status'],
                    'recipient_id' => $event['recipient_id'],
                    'occurred_at' => $occurredAt?->toISOString(),
                    'conversation_id' => $event['conversation_id'],
                    'raw' => $event['raw'],
                ],
            ]),
        ];

        if ($event['status'] === 'sent' && $occurredAt && $message->sent_at === null) {
            $updates['sent_at'] = $occurredAt;
        }

        if (in_array($event['status'], ['delivered', 'read', 'failed'], true) && $occurredAt) {
            $updates['received_at'] = $occurredAt;
        }

        if ($event['status'] === 'failed') {
            $updates['payload_json'] = array_replace_recursive($payload, [
                'provider_status_event' => [
                    'status' => $event['status'],
                    'recipient_id' => $event['recipient_id'],
                    'occurred_at' => $occurredAt?->toISOString(),
                    'conversation_id' => $event['conversation_id'],
                    'raw' => $event['raw'],
                ],
                'last_error' => [
                    'code' => (string) Arr::get($event['raw'], 'errors.0.code', 'provider_failed'),
                    'message' => (string) Arr::get($event['raw'], 'errors.0.title', 'WhatsApp provider reported a delivery failure.'),
                    'failed_at' => $occurredAt?->toISOString(),
                ],
            ]);
        }

        $message->forceFill($updates)->save();
    }

    private function parseTimestamp(?string $timestamp): ?CarbonImmutable
    {
        if ($timestamp === null || trim($timestamp) === '') {
            return null;
        }

        if (ctype_digit($timestamp)) {
            return CarbonImmutable::createFromTimestampUTC((int) $timestamp);
        }

        return CarbonImmutable::parse($timestamp);
    }
}
