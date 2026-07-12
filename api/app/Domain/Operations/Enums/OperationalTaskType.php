<?php

namespace App\Domain\Operations\Enums;

enum OperationalTaskType: string
{
    case CLIENT_PICKUP = 'client_pickup';
    case HUB_INTAKE = 'hub_intake';
    case DELIVERY = 'delivery';
    case RETURN_TO_HUB = 'return_to_hub';
    case RETURN_TO_CLIENT = 'return_to_client';
    case CASH_HANDOFF = 'cash_handoff';
}
