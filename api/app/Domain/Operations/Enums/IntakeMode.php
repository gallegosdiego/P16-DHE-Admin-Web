<?php

namespace App\Domain\Operations\Enums;

enum IntakeMode: string
{
    case PICKUP_AT_CLIENT_LOCATION = 'pickup_at_client_location';
    case PLANNED_DROPOFF_AT_HUB = 'planned_dropoff_at_hub';
    case WALK_IN_AT_HUB = 'walk_in_at_hub';

    public function requiresFieldAssignment(): bool
    {
        return $this === self::PICKUP_AT_CLIENT_LOCATION;
    }

    public function requiresServiceLocation(): bool
    {
        return $this !== self::PICKUP_AT_CLIENT_LOCATION;
    }
}
