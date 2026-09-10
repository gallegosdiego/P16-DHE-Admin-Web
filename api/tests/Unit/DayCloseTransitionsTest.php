<?php

namespace Tests\Unit;

use App\Domain\Shipment\Enums\ShipmentStatus;
use PHPUnit\Framework\TestCase;

class DayCloseTransitionsTest extends TestCase
{
    public function test_return_to_warehouse_is_additive_and_issue_is_not_allowed(): void
    {
        self::assertTrue(ShipmentStatus::ASSIGNED_TO_ROUTE->canTransitionTo(ShipmentStatus::IN_WAREHOUSE));
        self::assertTrue(ShipmentStatus::HANDED_TO_DRIVER->canTransitionTo(ShipmentStatus::IN_WAREHOUSE));
        self::assertFalse(ShipmentStatus::ISSUE->canTransitionTo(ShipmentStatus::IN_WAREHOUSE));
        self::assertFalse(ShipmentStatus::DELIVERED->canTransitionTo(ShipmentStatus::IN_WAREHOUSE));
    }

    public function test_day_close_recognizes_both_return_event_types(): void
    {
        $source = file_get_contents(__DIR__.'/../../app/Domain/Shipment/Services/DayCloseService.php');

        self::assertIsString($source);
        self::assertStringContainsString("whereIn('event_type', ['warehouse_return', 'returned_by_driver'])", $source);
        self::assertStringContainsString("whereIn('event_type', ['warehouse_return', 'returned_by_driver'])", $source);
    }

    public function test_in_transit_is_a_non_terminal_on_motorcycle_status(): void
    {
        self::assertFalse(ShipmentStatus::IN_TRANSIT->isTerminal());
        self::assertFalse(ShipmentStatus::HANDED_TO_DRIVER->isTerminal());
        self::assertFalse(ShipmentStatus::ASSIGNED_TO_ROUTE->isTerminal());
    }
}
