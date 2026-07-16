<?php

namespace App\Integrations\WhatsApp\Services;

use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Pickup\Models\PickupReviewEvent;
use App\Domain\Shipment\Models\Shipment;
use App\Integrations\WhatsApp\Enums\WhatsAppNotificationType;
use App\Integrations\WhatsApp\Jobs\SendWhatsAppMessage;
use App\Integrations\WhatsApp\Models\WhatsAppMessage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class PickupWhatsAppNotifier
{
    public function __construct(
        private readonly PickupStatusMessageBuilder $messageBuilder,
        private readonly WhatsAppSchema $schema,
    ) {}

    public function notifyInitialLifecycle(PickupRequest $pickup): void
    {
        $this->safelyQueue($pickup, WhatsAppNotificationType::REQUEST_RECEIVED);

        match ($pickup->status) {
            PickupStatus::PENDING_REVIEW,
            PickupStatus::NEEDS_CUSTOMER_INPUT => $this->safelyQueue($pickup, WhatsAppNotificationType::PENDING_REVIEW),
            PickupStatus::ACCEPTED,
            PickupStatus::READY_FOR_ASSIGNMENT,
            PickupStatus::ASSIGNED,
            PickupStatus::DRIVER_ON_THE_WAY,
            PickupStatus::PARTIALLY_PICKED_UP,
            PickupStatus::PICKED_UP => $this->safelyQueue($pickup, WhatsAppNotificationType::ACCEPTED),
            default => null,
        };
    }

    public function notifyCustomerInputRequired(PickupRequest $pickup, PickupReviewEvent $reviewEvent): void
    {
        $this->safelyQueue($pickup, WhatsAppNotificationType::CUSTOMER_INPUT_REQUIRED, [
            'review_event_id' => $reviewEvent->id,
            'requested_fields' => $reviewEvent->requested_fields_json ?? [],
            'reason_code' => $reviewEvent->reason_code,
        ]);
    }

    public function notifyAccepted(PickupRequest $pickup): void
    {
        $this->safelyQueue($pickup, WhatsAppNotificationType::ACCEPTED);
    }

    public function notifyDeliveryConfirmed(PickupRequest $pickup, ?Shipment $shipment = null): void
    {
        $this->safelyQueue($pickup, WhatsAppNotificationType::DELIVERY_CONFIRMED, [
            'shipment' => $shipment,
        ]);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function safelyQueue(
        PickupRequest $pickup,
        WhatsAppNotificationType $type,
        array $context = [],
    ): ?WhatsAppMessage {
        try {
            return $this->queue($pickup, $type, $context);
        } catch (Throwable $exception) {
            Log::warning('whatsapp.pickup_notification.failed_soft', [
                'pickup_request_id' => $pickup->id,
                'notification_type' => $type->value,
                'exception_class' => $exception::class,
                'message' => $exception->getMessage(),
                'exception' => $exception,
            ]);

            return null;
        }
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function queue(PickupRequest $pickup, WhatsAppNotificationType $type, array $context = []): ?WhatsAppMessage
    {
        if ($pickup->source !== 'whatsapp') {
            return null;
        }

        if (! $this->schema->supportsPickupNotifications()) {
            Log::notice('whatsapp.pickup_notification.skipped_schema_unavailable', [
                'pickup_request_id' => $pickup->id,
                'notification_type' => $type->value,
            ]);

            return null;
        }

        $pickup->loadMissing([
            'customer',
            'customerWhatsAppContact.whatsappContact',
        ]);

        $contact = $pickup->customerWhatsAppContact?->whatsappContact;

        if (! $contact || trim((string) $contact->wa_id) === '') {
            return null;
        }

        $correlationId = $this->correlationId($pickup, $type, $context);
        $existing = WhatsAppMessage::query()
            ->where('direction', 'outbound')
            ->where('correlation_id', $correlationId)
            ->first();

        if ($existing) {
            return $existing;
        }

        $message = WhatsAppMessage::query()->create([
            'whatsapp_contact_id' => $contact->id,
            'customer_id' => $pickup->customer_id,
            'direction' => 'outbound',
            'message_type' => $type->value,
            'message_status' => 'queued',
            'related_entity_type' => 'pickup_request',
            'related_entity_id' => $pickup->id,
            'correlation_id' => $correlationId,
            'payload_json' => [
                'provider' => 'meta_cloud',
                'notification_type' => $type->value,
                'notification_label' => $type->label(),
                'customer_visible_status' => $type->customerStatus()->value,
                'customer_visible_status_label' => $type->customerStatus()->label(),
                'to' => $contact->wa_id,
                'text' => $this->messageBuilder->build($pickup, $type, $context),
                'context' => $this->normalizeContext($context),
            ],
        ]);

        DB::afterCommit(function () use ($message, $pickup, $type): void {
            try {
                SendWhatsAppMessage::dispatch($message->id);
            } catch (Throwable $exception) {
                Log::warning('whatsapp.pickup_notification.dispatch_failed_soft', [
                    'pickup_request_id' => $pickup->id,
                    'whatsapp_message_id' => $message->id,
                    'notification_type' => $type->value,
                    'exception_class' => $exception::class,
                    'message' => $exception->getMessage(),
                    'exception' => $exception,
                ]);
            }
        });

        return $message;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function correlationId(PickupRequest $pickup, WhatsAppNotificationType $type, array $context): string
    {
        return match ($type) {
            WhatsAppNotificationType::CUSTOMER_INPUT_REQUIRED => sprintf(
                'wa_pickup_%s_%s_%s',
                $pickup->id,
                $type->value,
                (string) ($context['review_event_id'] ?? 'manual')
            ),
            WhatsAppNotificationType::DELIVERY_CONFIRMED => "wa_pickup_{$pickup->id}_{$type->value}",
            default => "wa_pickup_{$pickup->id}_{$type->value}",
        };
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function normalizeContext(array $context): array
    {
        $normalized = $context;

        if (($context['shipment'] ?? null) instanceof Shipment) {
            /** @var Shipment $shipment */
            $shipment = $context['shipment'];
            $normalized['shipment'] = [
                'id' => $shipment->id,
                'display_code' => $shipment->display_code,
                'tracking_code' => $shipment->tracking_code,
                'status' => $shipment->status->value,
            ];
        }

        return $normalized;
    }
}
