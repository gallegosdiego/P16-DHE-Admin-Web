<?php

namespace App\Domain\Pickup\Enums;

enum PickupBatchStatus: string
{
    case OPEN = 'open';
    case RECEIVING = 'receiving';
    case COMPLETED = 'completed';
    case COMPLETED_WITH_DIFFERENCES = 'completed_with_differences';
    case CANCELLED = 'cancelled';

    /** @return list<self> */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::OPEN => [self::RECEIVING, self::CANCELLED],
            self::RECEIVING => [self::COMPLETED, self::COMPLETED_WITH_DIFFERENCES, self::CANCELLED],
            self::COMPLETED, self::COMPLETED_WITH_DIFFERENCES, self::CANCELLED => [],
        };
    }

    public function canTransitionTo(self $target): bool
    {
        return in_array($target, $this->allowedTransitions(), true);
    }
}
