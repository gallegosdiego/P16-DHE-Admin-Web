<?php

namespace App\Http\Controllers\Api;

use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Enums\FinancialStatus;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FinancialController extends Controller
{
    /**
     * Dashboard financiero general.
     */
    public function overview(): JsonResponse
    {
        // Contra entrega
        $codPending = (int) Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'pending')
            ->sum('cod_amount');
        $codCollected = (int) Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'collected')
            ->sum('cod_amount');
        $codSettled = (int) Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'settled')
            ->sum('cod_amount');

        // Post-venta
        $postSalePending = (int) Shipment::where('payment_type', 'post_sale')
            ->where('financial_status', 'pending')
            ->sum('shipping_cost');
        $postSaleInvoiced = (int) Shipment::where('payment_type', 'post_sale')
            ->where('financial_status', 'invoiced')
            ->sum('shipping_cost');
        $postSaleOverdue = (int) Shipment::where('payment_type', 'post_sale')
            ->where('financial_status', 'overdue')
            ->sum('shipping_cost');

        // Pendiente a conductores
        $driversPending = (int) Shipment::where('driver_paid', false)
            ->where('status', 'delivered')
            ->sum('driver_fee');

        return response()->json([
            'cod' => [
                'pending' => $codPending,
                'collected' => $codCollected,
                'settled' => $codSettled,
            ],
            'post_sale' => [
                'pending' => $postSalePending,
                'invoiced' => $postSaleInvoiced,
                'overdue' => $postSaleOverdue,
                'total_receivable' => $postSalePending + $postSaleInvoiced + $postSaleOverdue,
            ],
            'drivers' => [
                'pending_payment' => $driversPending,
            ],
            'totals' => [
                'total_receivable' => $codPending + $codCollected + $postSalePending + $postSaleInvoiced + $postSaleOverdue,
                'total_payable' => $driversPending,
            ],
        ]);
    }

    /**
     * Board de recaudo por conductor.
     */
    public function driverBoard(): JsonResponse
    {
        $drivers = Driver::where('status', '!=', 'inactive')
            ->withSum(['shipments as cod_pending' => fn ($q) =>
                $q->where('payment_type', 'cash_on_delivery')
                  ->where('financial_status', 'pending')
            ], 'cod_amount')
            ->withSum(['shipments as cod_collected' => fn ($q) =>
                $q->where('payment_type', 'cash_on_delivery')
                  ->where('financial_status', 'collected')
            ], 'cod_amount')
            ->withSum(['shipments as unpaid_fees' => fn ($q) =>
                $q->where('driver_paid', false)
                  ->where('status', 'delivered')
            ], 'driver_fee')
            ->withCount(['shipments as today_deliveries' => fn ($q) =>
                $q->where('status', 'delivered')
                  ->whereDate('delivered_at', now()->toDateString())
            ])
            ->orderBy('name')
            ->get();

        return response()->json($drivers);
    }

    /**
     * Marcar un envío como recaudado (conductor cobró contra entrega).
     */
    public function markCollected(Request $request, Shipment $shipment): JsonResponse
    {
        if ($shipment->payment_type->value !== 'cash_on_delivery') {
            return response()->json(['error' => 'Este envío no es contra entrega.'], 422);
        }

        $old = $shipment->financial_status;
        $shipment->update(['financial_status' => 'collected']);

        AuditLog::log('financial.collect', $shipment,
            ['financial_status' => $old],
            ['financial_status' => 'collected'],
            "COD recaudado: \${$shipment->cod_amount}"
        );

        return response()->json($shipment->fresh());
    }

    /**
     * Liquidar contra entrega (conductor entregó dinero a oficina).
     */
    public function settleShipment(Request $request, Shipment $shipment): JsonResponse
    {
        $old = $shipment->financial_status;
        $shipment->update(['financial_status' => 'settled']);

        AuditLog::log('financial.settle', $shipment,
            ['financial_status' => $old],
            ['financial_status' => 'settled'],
            "Envío liquidado: {$shipment->display_code}"
        );

        return response()->json($shipment->fresh());
    }

    /**
     * Marcar pago al conductor por un envío.
     */
    public function markDriverPaid(Request $request, Shipment $shipment): JsonResponse
    {
        $shipment->update(['driver_paid' => true]);

        AuditLog::log('financial.driver_paid', $shipment,
            ['driver_paid' => false],
            ['driver_paid' => true],
            "Pago conductor: \${$shipment->driver_fee} por {$shipment->display_code}"
        );

        return response()->json($shipment->fresh());
    }

    /**
     * Liquidar lote (varios envíos a la vez).
     */
    public function settleBatch(Request $request): JsonResponse
    {
        $request->validate([
            'shipment_ids' => ['required', 'array', 'min:1'],
            'shipment_ids.*' => ['exists:shipments,id'],
        ]);

        $count = Shipment::whereIn('id', $request->shipment_ids)
            ->update(['financial_status' => 'settled']);

        return response()->json([
            'message' => "{$count} envíos liquidados.",
            'count' => $count,
        ]);
    }
}
