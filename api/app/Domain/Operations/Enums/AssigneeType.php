<?php

namespace App\Domain\Operations\Enums;

enum AssigneeType: string
{
    case DANHEI_DRIVER = 'danhei_driver';
    case AUTHORIZED_COLLECTOR = 'authorized_collector';
    case HUB_OPERATOR = 'hub_operator';
}
