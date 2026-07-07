<?php

namespace App\Integrations\WhatsApp\Enums;

enum WhatsAppCustomerStatus: string
{
    case REQUEST_RECEIVED = 'request_received';
    case PENDING_REVIEW = 'pending_review';
    case ACCEPTED = 'accepted';
    case DELIVERY_CONFIRMED = 'delivery_confirmed';

    public function label(): string
    {
        return match ($this) {
            self::REQUEST_RECEIVED => 'Solicitud recibida',
            self::PENDING_REVIEW => 'Pendiente de revision',
            self::ACCEPTED => 'Aceptada',
            self::DELIVERY_CONFIRMED => 'Entrega confirmada',
        };
    }
}
