<?php

namespace App\Domain\Financial\Enums;

/**
 * Estados del pago financiero.
 *
 * Para contra entrega:
 * PENDING → COLLECTED (repartidor cobró) → SETTLED (entregó a oficina)
 *
 * Para post-venta:
 * PENDING → INVOICED (factura enviada) → SETTLED (cliente pagó)
 */
enum FinancialStatus: string
{
    case PENDING = 'pending';
    case COLLECTED = 'collected';
    case INVOICED = 'invoiced';
    case SETTLED = 'settled';
    case OVERDUE = 'overdue';

    public function label(): string
    {
        return match ($this) {
            self::PENDING => 'Pendiente',
            self::COLLECTED => 'Recaudado',
            self::INVOICED => 'Facturado',
            self::SETTLED => 'Liquidado',
            self::OVERDUE => 'Vencido',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::PENDING => '#ff8616',
            self::COLLECTED => '#1f86ff',
            self::INVOICED => '#7357d8',
            self::SETTLED => '#12a85f',
            self::OVERDUE => '#e72256',
        };
    }
}
