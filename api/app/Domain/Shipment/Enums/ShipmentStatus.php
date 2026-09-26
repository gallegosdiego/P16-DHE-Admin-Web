<?php

namespace App\Domain\Shipment\Enums;

/**
 * Estados del ciclo de vida de un envío en Danhei Express.
 *
 * Flujo principal:
 * REGISTERED → CONFIRMED → PICKUP_SCHEDULED → PICKED_UP → IN_WAREHOUSE
 * → HANDED_TO_DRIVER (el piloto lo escanea) → ASSIGNED_TO_ROUTE → IN_TRANSIT → DELIVERED
 *
 * Flujos alternativos:
 * Casi cualquier estado operativo → ISSUE (novedad)
 * ISSUE → IN_WAREHOUSE (el piloto devuelve a bodega lo que no pudo entregar)
 * ISSUE → IN_TRANSIT (reintento) · ISSUE → RETURNED (devolución al remitente)
 * IN_TRANSIT → HANDED_TO_DRIVER (otro piloto lo escanea en plena salida, o
 *   se retira de la ruta y sigue en la moto) · IN_TRANSIT → IN_WAREHOUSE
 *   (vuelve a bodega con la salida ya cerrada)
 * Cualquier estado antes de IN_TRANSIT → CANCELLED
 */
enum ShipmentStatus: string
{
    case REGISTERED = 'registered';
    case CONFIRMED = 'confirmed';
    case PICKUP_SCHEDULED = 'pickup_scheduled';
    case PICKED_UP = 'picked_up';
    case IN_WAREHOUSE = 'in_warehouse';
    case HANDED_TO_DRIVER = 'handed_to_driver';
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
            self::HANDED_TO_DRIVER => 'Entregado al piloto',
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
            self::HANDED_TO_DRIVER => '#1f86ff',
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
            self::PICKED_UP => [self::IN_WAREHOUSE, self::HANDED_TO_DRIVER, self::ASSIGNED_TO_ROUTE, self::ISSUE],
            self::IN_WAREHOUSE => [self::HANDED_TO_DRIVER, self::ASSIGNED_TO_ROUTE, self::ISSUE],
            self::HANDED_TO_DRIVER => [self::ASSIGNED_TO_ROUTE, self::IN_TRANSIT, self::IN_WAREHOUSE, self::ISSUE],
            self::ASSIGNED_TO_ROUTE => [self::HANDED_TO_DRIVER, self::IN_TRANSIT, self::IN_WAREHOUSE, self::ISSUE],
            self::IN_TRANSIT => [self::DELIVERED, self::ISSUE, self::HANDED_TO_DRIVER, self::IN_WAREHOUSE],
            self::DELIVERED => [],
            self::ISSUE => [self::IN_TRANSIT, self::IN_WAREHOUSE, self::RETURNED, self::CANCELLED],
            self::RETURNED => [],
            self::CANCELLED => [],
        };
    }

    public function canTransitionTo(ShipmentStatus $target): bool
    {
        return in_array($target, $this->allowedTransitions());
    }
}
