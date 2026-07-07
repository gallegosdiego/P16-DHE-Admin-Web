<?php

namespace App\Integrations\WhatsApp\Enums;

enum CustomerWhatsAppContactStatus: string
{
    case PENDING = 'PENDING';
    case AUTHORIZED = 'AUTHORIZED';
    case SUSPENDED = 'SUSPENDED';
    case REVOKED = 'REVOKED';
}
