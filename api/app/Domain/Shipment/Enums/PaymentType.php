<?php

namespace App\Domain\Shipment\Enums;

/**
 * Tipos de pago del envío.
 *
 * CASH_ON_DELIVERY: El destinatario paga al repartidor al momento de la entrega.
 * POST_SALE: El cliente corporativo paga después (facturación posterior).
 * PREPAID: El cliente ya pagó antes del envío.
 */
enum PaymentType: string
{
    case CASH_ON_DELIVERY = 'cash_on_delivery';
    case POST_SALE = 'post_sale';
    case PREPAID = 'prepaid';

    public function label(): string
    {
        return match ($this) {
            self::CASH_ON_DELIVERY => 'Contra entrega',
            self::POST_SALE => 'Post-venta',
            self::PREPAID => 'Prepago',
        };
    }
}
