<?php

namespace App\Integrations\WhatsApp\Enums;

enum WhatsAppNotificationType: string
{
    case REQUEST_RECEIVED = 'request_received';
    case PENDING_REVIEW = 'pending_review';
    case CUSTOMER_INPUT_REQUIRED = 'customer_input_required';
    case ACCEPTED = 'accepted';
    case DELIVERY_CONFIRMED = 'delivery_confirmed';

    public function label(): string
    {
        return match ($this) {
            self::REQUEST_RECEIVED => 'Solicitud recibida',
            self::PENDING_REVIEW => 'Pendiente de revision',
            self::CUSTOMER_INPUT_REQUIRED => 'Solicitud de datos',
            self::ACCEPTED => 'Solicitud aceptada',
            self::DELIVERY_CONFIRMED => 'Entrega confirmada',
        };
    }

    public function customerStatus(): WhatsAppCustomerStatus
    {
        return match ($this) {
            self::REQUEST_RECEIVED => WhatsAppCustomerStatus::REQUEST_RECEIVED,
            self::PENDING_REVIEW,
            self::CUSTOMER_INPUT_REQUIRED => WhatsAppCustomerStatus::PENDING_REVIEW,
            self::ACCEPTED => WhatsAppCustomerStatus::ACCEPTED,
            self::DELIVERY_CONFIRMED => WhatsAppCustomerStatus::DELIVERY_CONFIRMED,
        };
    }
}
