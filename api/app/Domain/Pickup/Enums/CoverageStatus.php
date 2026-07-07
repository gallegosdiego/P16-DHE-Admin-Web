<?php

namespace App\Domain\Pickup\Enums;

enum CoverageStatus: string
{
    case IN_COVERAGE = 'IN_COVERAGE';
    case NEAR_BOUNDARY = 'NEAR_BOUNDARY';
    case OUT_OF_COVERAGE = 'OUT_OF_COVERAGE';
    case UNRESOLVED = 'UNRESOLVED';

    public function requiresReview(): bool
    {
        return in_array($this, [
            self::NEAR_BOUNDARY,
            self::UNRESOLVED,
        ], true);
    }
}
