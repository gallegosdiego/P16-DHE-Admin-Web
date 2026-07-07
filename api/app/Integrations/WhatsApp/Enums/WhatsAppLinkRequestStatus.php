<?php

namespace App\Integrations\WhatsApp\Enums;

enum WhatsAppLinkRequestStatus: string
{
    case PENDING = 'PENDING';
    case APPROVED = 'APPROVED';
    case REJECTED = 'REJECTED';
    case EXPIRED = 'EXPIRED';
}
