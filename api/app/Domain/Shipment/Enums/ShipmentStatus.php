<?php

namespace App\Domain\Shipment\Enums;

/**
 * Estados del ciclo de vida de un envío en Danhei Express.
 *
 * Flujo principal:
 * REGISTERED → CONFIRMED → PICKUP_SCHEDULED → PICKED_UP → IN_WAREHOUSE
 * → ASSIGNED_TO_ROUTE → IN_TRANSIT → DELIVERED
 *
 * Flujos alternativos:
 * Cualquier estado → ISSUE (novedad)
 * ISSUE → RETURNED (devolución)
 * Cualquier estado antes de IN_TRANSIT → CANCELLED
 */
enum ShipmentStatus: string
{
    case REGISTERED = 'registered';
    case CONFIRMED = 'confirmed';
    case PICKUP_SCHEDULED = 'pickup_scheduled';
    case PICKED_UP = 'picked_up';
    case IN_WAREHOUSE = 'in_warehouse';
    case ASSIGNED_TO_ROUTE = 'assigned_to_route';
    case IN_TRANSIT = 'in_transit';
    case DELIVERED = 'delivered';
    case ISSUE = 'issue';
    case RETURNED = 'returned';
    case CANCELLED = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::REGISTERED => 'Registrado',
            self::CONFIRMED => 'Confirmado',
            self::PICKUP_SCHEDULED => 'Recogida programada',
            self::PICKED_UP => 'Recogido',
            self::IN_WAREHOUSE => 'En bodega',
            self::ASSIGNED_TO_ROUTE => 'Asignado a ruta',
            self::IN_TRANSIT => 'En ruta',
            self::DELIVERED => 'Entregado',
            self::ISSUE => 'Novedad',
            self::RETURNED => 'Devuelto',
            self::CANCELLED => 'Cancelado',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::REGISTERED => '#8f96a3',
            self::CONFIRMED => '#7357d8',
            self::PICKUP_SCHEDULED => '#ff8616',
            self::PICKED_UP => '#1f86ff',
            self::IN_WAREHOUSE => '#00668A',
            self::ASSIGNED_TO_ROUTE => '#1f86ff',
            self::IN_TRANSIT => '#1f86ff',
            self::DELIVERED => '#12a85f',
            self::ISSUE => '#e72256',
            self::RETURNED => '#8f96a3',
            self::CANCELLED => '#687083',
        };
    }

    public function isTerminal(): bool
    {
        return in_array($this, [
            self::DELIVERED,
            self::RETURNED,
            self::CANCELLED,
        ]);
    }

    /**
     * Transiciones válidas desde este estado.
     *
     * @return array<ShipmentStatus>
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::REGISTERED => [self::CONFIRMED, self::CANCELLED],
            self::CONFIRMED => [self::PICKUP_SCHEDULED, self::CANCELLED],
            self::PICKUP_SCHEDULED => [self::PICKED_UP, self::ISSUE, self::CANCELLED],
            self::PICKED_UP => [self::IN_WAREHOUSE, self::ASSIGNED_TO_ROUTE, self::ISSUE],
            self::IN_WAREHOUSE => [self::ASSIGNED_TO_ROUTE, self::ISSUE],
            self::ASSIGNED_TO_ROUTE => [self::IN_TRANSIT, self::ISSUE],
            self::IN_TRANSIT => [self::DELIVERED, self::ISSUE],
            self::DELIVERED => [],
            self::ISSUE => [self::IN_TRANSIT, self::RETURNED, self::CANCELLED],
            self::RETURNED => [],
            self::CANCELLED => [],
        };
    }

    public function canTransitionTo(ShipmentStatus $target): bool
    {
        return in_array($target, $this->allowedTransitions());
    }
}
