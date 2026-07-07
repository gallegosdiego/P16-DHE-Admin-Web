<?php

namespace App\Integrations\WhatsApp\Services;

use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Shipment\Models\Shipment;
use App\Integrations\WhatsApp\Enums\WhatsAppNotificationType;
use Illuminate\Support\Arr;

class PickupStatusMessageBuilder
{
    /**
     * @param array<string, mixed> $context
     */
    public function build(PickupRequest $pickup, WhatsAppNotificationType $type, array $context = []): string
    {
        return match ($type) {
            WhatsAppNotificationType::REQUEST_RECEIVED => $this->requestReceived($pickup),
            WhatsAppNotificationType::PENDING_REVIEW => $this->pendingReview($pickup),
            WhatsAppNotificationType::CUSTOMER_INPUT_REQUIRED => $this->customerInputRequired($pickup, $context),
            WhatsAppNotificationType::ACCEPTED => $this->accepted($pickup),
            WhatsAppNotificationType::DELIVERY_CONFIRMED => $this->deliveryConfirmed($pickup, $context),
        };
    }

    private function requestReceived(PickupRequest $pickup): string
    {
        return "Danhei: recibimos tu solicitud de recogida {$pickup->pickup_code} para {$pickup->package_count} paquete(s). La estamos validando y te confirmaremos el siguiente paso.";
    }

    private function pendingReview(PickupRequest $pickup): string
    {
        return "Danhei: tu solicitud {$pickup->pickup_code} quedo en pendiente de revision. Nuestro equipo validara cobertura, jornada y reglas antes de continuar.";
    }

    /**
     * @param array<string, mixed> $context
     */
    private function customerInputRequired(PickupRequest $pickup, array $context): string
    {
        $requestedFields = collect((array) Arr::get($context, 'requested_fields', []))
            ->map(fn (mixed $field): string => $this->fieldLabel((string) $field))
            ->filter()
            ->values();

        $fieldText = $requestedFields->isNotEmpty()
            ? ' Necesitamos confirmar: '.$requestedFields->implode(', ').'.'
            : '';

        return "Danhei: tu solicitud {$pickup->pickup_code} sigue en revision manual.{$fieldText} Responde este chat y nuestro equipo te ayudara a completarla.";
    }

    private function accepted(PickupRequest $pickup): string
    {
        return "Danhei: tu solicitud {$pickup->pickup_code} fue aceptada. Ya quedo lista para programar la recogida en {$pickup->pickup_window_label}.";
    }

    /**
     * @param array<string, mixed> $context
     */
    private function deliveryConfirmed(PickupRequest $pickup, array $context): string
    {
        /** @var Shipment|null $shipment */
        $shipment = Arr::get($context, 'shipment');
        $guide = $shipment?->display_code ?? $shipment?->tracking_code;
        $guideText = $guide ? " asociada a la guia {$guide}" : '';

        return "Danhei: confirmamos la entrega{$guideText} de la solicitud {$pickup->pickup_code}. Gracias por usar nuestro canal de recogidas por WhatsApp.";
    }

    private function fieldLabel(string $field): string
    {
        return match ($field) {
            'pickup_address_line1' => 'direccion de recogida',
            'contact_name' => 'nombre de contacto',
            'contact_phone' => 'telefono de contacto',
            'delivery_address_line1' => 'direccion de entrega',
            'recipient_phone' => 'telefono del destinatario',
            'requested_cod_amount' => 'monto COD',
            default => trim(str_replace('_', ' ', $field)),
        };
    }
}
