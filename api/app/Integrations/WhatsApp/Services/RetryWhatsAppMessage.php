<?php

namespace App\Integrations\WhatsApp\Services;

use App\Domain\Pickup\Models\PickupRequest;
use App\Integrations\WhatsApp\Jobs\SendWhatsAppMessage;
use App\Integrations\WhatsApp\Models\WhatsAppMessage;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class RetryWhatsAppMessage
{
    public function execute(PickupRequest $pickupRequest, WhatsAppMessage $message): WhatsAppMessage
    {
        if ($message->direction !== 'outbound') {
            throw new InvalidArgumentException('Solo se pueden reintentar mensajes salientes.');
        }

        if ($message->related_entity_type !== 'pickup_request' || $message->related_entity_id !== $pickupRequest->id) {
            throw new InvalidArgumentException('El mensaje no pertenece a la recogida indicada.');
        }

        if (! in_array((string) $message->message_status, ['failed', 'simulated'], true)) {
            throw new InvalidArgumentException('Solo se pueden reintentar mensajes fallidos o simulados.');
        }

        $payload = $message->payload_json ?? [];

        $retryPayload = array_replace_recursive($payload, [
            'dispatch_mode' => null,
            'provider_response' => null,
            'provider_status_event' => null,
            'simulated_at' => null,
            'last_error' => null,
            'retry_of_message_id' => $message->id,
            'retried_at' => now()->toISOString(),
        ]);

        $retryMessage = WhatsAppMessage::query()->create([
            'whatsapp_contact_id' => $message->whatsapp_contact_id,
            'customer_id' => $message->customer_id,
            'direction' => 'outbound',
            'provider_message_id' => null,
            'message_type' => $message->message_type,
            'message_status' => 'queued',
            'related_entity_type' => $message->related_entity_type,
            'related_entity_id' => $message->related_entity_id,
            'correlation_id' => $this->retryCorrelationId($message),
            'payload_json' => $this->cleanPayload($retryPayload),
            'sent_at' => null,
            'received_at' => null,
        ]);

        DB::afterCommit(fn () => SendWhatsAppMessage::dispatch($retryMessage->id));

        return $retryMessage;
    }

    private function retryCorrelationId(WhatsAppMessage $message): string
    {
        return sprintf(
            '%s_retry_%s',
            $message->correlation_id,
            str()->lower((string) str()->ulid())
        );
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function cleanPayload(array $payload): array
    {
        return collect($payload)
            ->reject(static fn (mixed $value): bool => $value === null)
            ->map(static function (mixed $value): mixed {
                if (! is_array($value)) {
                    return $value;
                }

                return collect($value)
                    ->reject(static fn (mixed $nested): bool => $nested === null)
                    ->all();
            })
            ->all();
    }
}
