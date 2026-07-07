<?php

namespace App\Domain\Pickup\Enums;

enum CustomerWhatsAppStatus: string
{
    case DISABLED = 'DISABLED';
    case PENDING_CONFIGURATION = 'PENDING_CONFIGURATION';
    case ACTIVE = 'ACTIVE';
    case SUSPENDED = 'SUSPENDED';

    public function canStartAutomaticPickup(): bool
    {
        return $this === self::ACTIVE;
    }
}
