<?php

namespace App\Integrations\WhatsApp\Services;

class MetaWebhookEventIdExtractor
{
    public function extract(array $payload): ?string
    {
        foreach (($payload['entry'] ?? []) as $entry) {
            foreach (($entry['changes'] ?? []) as $change) {
                $value = $change['value'] ?? [];

                foreach (($value['messages'] ?? []) as $message) {
                    if (is_string($message['id'] ?? null) && $message['id'] !== '') {
                        return $message['id'];
                    }
                }

                foreach (($value['statuses'] ?? []) as $status) {
                    if (is_string($status['id'] ?? null) && $status['id'] !== '') {
                        return $status['id'];
                    }
                }
            }
        }

        return null;
    }
}
