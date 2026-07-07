<?php

namespace App\Integrations\WhatsApp\Services;

class MetaFlowMessageExtractor
{
    /**
     * @return list<array{
     *     provider_message_id:string,
     *     wa_id:string,
     *     display_name:?string,
     *     flow_id:string,
     *     submission_id:string,
     *     response:array<string, mixed>
     * }>
     */
    public function extractPickupSubmissions(array $payload): array
    {
        $submissions = [];

        foreach (($payload['entry'] ?? []) as $entry) {
            foreach (($entry['changes'] ?? []) as $change) {
                $value = $change['value'] ?? [];
                $contacts = $value['contacts'] ?? [];
                $messages = $value['messages'] ?? [];

                foreach ($messages as $message) {
                    if (($message['type'] ?? null) !== 'interactive') {
                        continue;
                    }

                    $interactive = $message['interactive'] ?? [];

                    if (($interactive['type'] ?? null) !== 'nfm_reply') {
                        continue;
                    }

                    $reply = $interactive['nfm_reply'] ?? [];
                    $response = $this->decodeResponse($reply['response_json'] ?? null);

                    if ($response === null) {
                        continue;
                    }

                    $waId = (string) ($message['from'] ?? $contacts[0]['wa_id'] ?? '');

                    if ($waId === '') {
                        continue;
                    }

                    $providerMessageId = (string) ($message['id'] ?? '');
                    $flowId = (string) ($reply['name'] ?? $response['flow_id'] ?? 'pickup_request');
                    $submissionId = (string) ($response['flow_token'] ?? $response['submission_id'] ?? $providerMessageId);

                    if ($providerMessageId === '' || $submissionId === '') {
                        continue;
                    }

                    $submissions[] = [
                        'provider_message_id' => $providerMessageId,
                        'wa_id' => $waId,
                        'display_name' => $contacts[0]['profile']['name'] ?? null,
                        'flow_id' => $flowId,
                        'submission_id' => $submissionId,
                        'response' => $response,
                    ];
                }
            }
        }

        return $submissions;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function decodeResponse(mixed $response): ?array
    {
        if (is_array($response)) {
            return $response;
        }

        if (! is_string($response) || trim($response) === '') {
            return null;
        }

        $decoded = json_decode($response, true);

        return is_array($decoded) ? $decoded : null;
    }
}
