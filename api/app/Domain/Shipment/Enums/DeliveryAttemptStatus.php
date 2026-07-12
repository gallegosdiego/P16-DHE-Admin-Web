<?php

namespace App\Domain\Shipment\Enums;

enum DeliveryAttemptStatus: string
{
    case STARTED = 'started';
    case ARRIVED = 'arrived';
    case DELIVERED = 'delivered';
    case NOT_DELIVERED = 'not_delivered';
    case CANCELLED = 'cancelled';

    public function isTerminal(): bool
    {
        return in_array($this, [self::DELIVERED, self::NOT_DELIVERED, self::CANCELLED], true);
    }
}
