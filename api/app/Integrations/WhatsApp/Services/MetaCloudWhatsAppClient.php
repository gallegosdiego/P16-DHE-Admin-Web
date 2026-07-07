<?php

namespace App\Integrations\WhatsApp\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class MetaCloudWhatsAppClient
{
    /**
     * @return array<string, mixed>
     */
    public function sendTextMessage(string $to, string $text): array
    {
        $baseUrl = rtrim((string) config('services.whatsapp.base_url', 'https://graph.facebook.com'), '/');
        $version = trim((string) config('services.whatsapp.api_version', 'v23.0'));
        $phoneNumberId = trim((string) config('services.whatsapp.phone_number_id', ''));
        $accessToken = trim((string) config('services.whatsapp.access_token', ''));

        if ($phoneNumberId === '' || $accessToken === '') {
            throw new RuntimeException('WhatsApp Cloud API credentials are incomplete.');
        }

        $response = Http::acceptJson()
            ->withToken($accessToken)
            ->post("{$baseUrl}/{$version}/{$phoneNumberId}/messages", [
                'messaging_product' => 'whatsapp',
                'recipient_type' => 'individual',
                'to' => $to,
                'type' => 'text',
                'text' => [
                    'preview_url' => false,
                    'body' => $text,
                ],
            ]);

        if ($response->failed()) {
            throw new RuntimeException(
                $response->json('error.message')
                    ?? $response->body()
                    ?? 'WhatsApp Cloud API rejected the outbound message.'
            );
        }

        /** @var array<string, mixed> $payload */
        $payload = $response->json();

        return $payload;
    }
}
