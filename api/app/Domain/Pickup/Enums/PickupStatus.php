<?php

namespace App\Domain\Pickup\Enums;

enum PickupStatus: string
{
    case DRAFT = 'draft';
    case PENDING_REVIEW = 'pending_review';
    case NEEDS_CUSTOMER_INPUT = 'needs_customer_input';
    case SUBMITTED = 'submitted';
    case ACCEPTED = 'accepted';
    case READY_FOR_ASSIGNMENT = 'ready_for_assignment';
    case ASSIGNED = 'assigned';
    case DRIVER_ON_THE_WAY = 'driver_on_the_way';
    case PARTIALLY_PICKED_UP = 'partially_picked_up';
    case PICKED_UP = 'picked_up';
    case NOT_PICKED_UP = 'not_picked_up';
    case CANCELLED = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::DRAFT => 'Borrador',
            self::PENDING_REVIEW => 'Pendiente de revisión',
            self::NEEDS_CUSTOMER_INPUT => 'Requiere datos del cliente',
            self::SUBMITTED => 'Enviada',
            self::ACCEPTED => 'Aceptada',
            self::READY_FOR_ASSIGNMENT => 'Lista para asignación',
            self::ASSIGNED => 'Asignada',
            self::DRIVER_ON_THE_WAY => 'Piloto en camino',
            self::PARTIALLY_PICKED_UP => 'Recogida parcial',
            self::PICKED_UP => 'Recogida completa',
            self::NOT_PICKED_UP => 'No recogida',
            self::CANCELLED => 'Cancelada',
        };
    }

    public function isOperational(): bool
    {
        return ! in_array($this, [
            self::DRAFT,
            self::PENDING_REVIEW,
            self::NEEDS_CUSTOMER_INPUT,
        ], true);
    }
}
