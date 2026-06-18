<?php

namespace App\Domain\Shipment\Enums;

/**
 * Tipos de pago del envío.
 *
 * CASH_ON_DELIVERY: El destinatario paga al repartidor al momento de la entrega.
 * POST_SALE: El cliente corporativo paga después (facturación posterior).
 * PREPAID: El cliente ya pagó antes del envío.
 * MERCADO_LIBRE: Piloto entrega sin cobrar. Mercado Libre paga a Danhei después por transferencia (post-entrega).
 */
enum PaymentType: string
{
    case CASH_ON_DELIVERY = 'cash_on_delivery';
    case POST_SALE = 'post_sale';
    case PREPAID = 'prepaid';
    case MercadoLibre = 'mercado_libre';

    public function label(): string
    {
        return match ($this) {
            self::CASH_ON_DELIVERY => 'Contra entrega',
            self::POST_SALE => 'Post-venta',
            self::PREPAID => 'Prepago',
            self::MercadoLibre => 'Mercado Libre',
        };
    }
}
