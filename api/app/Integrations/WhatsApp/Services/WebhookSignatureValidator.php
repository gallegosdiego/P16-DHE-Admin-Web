<?php

namespace App\Integrations\WhatsApp\Services;

class WebhookSignatureValidator
{
    public function validate(string $rawPayload, ?string $signatureHeader): bool
    {
        $secret = trim((string) config('services.whatsapp.app_secret', ''));

        if ($secret === '' || ! is_string($signatureHeader) || $signatureHeader === '') {
            return false;
        }

        $expected = 'sha256='.hash_hmac('sha256', $rawPayload, $secret);

        return hash_equals($expected, $signatureHeader);
    }
}
