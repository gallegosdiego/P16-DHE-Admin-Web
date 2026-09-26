<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * Acciones de dinero de los sistemas viejos (conciliaciones COD por día,
 * marca `driver_paid`, recaudo/liquidación por lote y pagos consolidados a
 * pilotos). Escribían por fuera del libro de Conciliación y permitían, por
 * ejemplo, pagarle dos veces el mismo servicio a un piloto.
 *
 * Desde septiembre de 2026 el único sistema para el dinero de los pilotos es
 * Pagos → Conciliación. Estas rutas se conservan solo para responder 410 con
 * un mensaje claro a quien todavía las llame; las lecturas siguen activas.
 */
class RetiredFinancialActionController extends Controller
{
    public const MESSAGE = 'Esta acción se retiró. Usa Pagos → Conciliación.';

    public function __invoke(): JsonResponse
    {
        return response()->json([
            'message' => self::MESSAGE,
            'error' => 'retired',
            'use' => 'Pagos → Conciliación',
        ], 410);
    }
}
