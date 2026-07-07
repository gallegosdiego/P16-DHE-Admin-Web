<?php

namespace App\Integrations\WhatsApp\Services;

class MetaMessageStatusExtractor
{
    /**
     * @return list<array{
     *     provider_message_id:string,
     *     status:string,
     *     recipient_id:?string,
     *     occurred_at:?string,
     *     conversation_id:?string,
     *     raw:array<string, mixed>
     * }>
     */
    public function extract(array $payload): array
    {
        $events = [];

        foreach (($payload['entry'] ?? []) as $entry) {
            foreach (($entry['changes'] ?? []) as $change) {
                foreach (($change['value']['statuses'] ?? []) as $status) {
                    $providerMessageId = trim((string) ($status['id'] ?? ''));
                    $state = trim((string) ($status['status'] ?? ''));

                    if ($providerMessageId === '' || $state === '') {
                        continue;
                    }

                    $events[] = [
                        'provider_message_id' => $providerMessageId,
                        'status' => $state,
                        'recipient_id' => isset($status['recipient_id']) ? (string) $status['recipient_id'] : null,
                        'occurred_at' => isset($status['timestamp']) ? (string) $status['timestamp'] : null,
                        'conversation_id' => isset($status['conversation']['id']) ? (string) $status['conversation']['id'] : null,
                        'raw' => is_array($status) ? $status : [],
                    ];
                }
            }
        }

        return $events;
    }
}
