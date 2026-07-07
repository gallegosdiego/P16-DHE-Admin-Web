<?php

namespace App\Integrations\WhatsApp\Enums;

enum WhatsAppContactVerificationStatus: string
{
    case UNKNOWN = 'UNKNOWN';
    case KNOWN = 'KNOWN';
    case VERIFIED = 'VERIFIED';
    case BLOCKED = 'BLOCKED';
}
