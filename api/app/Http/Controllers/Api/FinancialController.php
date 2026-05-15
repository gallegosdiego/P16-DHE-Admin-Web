<?php

namespace App\Http\Controllers\Api;

use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Services\ProfitCalculator;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
            ->with(['shipments' => fn ($q) =>
                $q->select('id', 'driver_id', 'payment_type', 'financial_status', 'driver_paid', 'status')
                  ->where(function ($inner) {
                      $inner->where(function ($codPending) {
                          $codPending->where('payment_type', 'cash_on_delivery')
                              ->where('financial_status', 'pending');
                      })->orWhere(function ($codCollected) {
                          $codCollected->where('payment_type', 'cash_on_delivery')
                              ->where('financial_status', 'collected');
                      })->orWhere(function ($unpaid) {
                          $unpaid->where('status', 'delivered')
                              ->where('driver_paid', false);
                      });
                  })
                  ->orderByDesc('id')
            ])
            ->orderBy('name')
            ->get();

        $payload = $drivers->map(function ($driver) {
            $toValue = fn ($field) => is_object($field) && property_exists($field, 'value') ? $field->value : (string) $field;

            $collectShipmentId = $driver->shipments
                ->first(fn ($shipment) =>
                    $toValue($shipment->payment_type) === 'cash_on_delivery'
                    && $toValue($shipment->financial_status) === 'pending'
                )?->id;

            $settleShipmentId = $driver->shipments
                ->first(fn ($shipment) =>
                    $toValue($shipment->payment_type) === 'cash_on_delivery'
                    && $toValue($shipment->financial_status) === 'collected'
                )?->id;

            $driverPaidShipmentId = $driver->shipments
                ->first(fn ($shipment) =>
                    $toValue($shipment->status) === 'delivered'
                    && $shipment->driver_paid === false
                )?->id;

            $driverData = $driver->toArray();
            unset($driverData['shipments']);

            return [
                ...$driverData,
                'collect_shipment_id' => $collectShipmentId,
                'settle_shipment_id' => $settleShipmentId,
                'driver_paid_shipment_id' => $driverPaidShipmentId,
            ];
        });

        return response()->json($payload);
    }

    /**
     * Marcar un envío como recaudado (conductor cobró contra entrega).
     */
    public function markCollected(Request $request, Shipment $shipment): JsonResponse
    {
        if ($shipment->payment_type->value !== 'cash_on_delivery') {
            return response()->json([
                'message' => 'Este envío no es contra entrega.',
                'error' => 'Este envío no es contra entrega.',
            ], 422);
        }

        if (in_array($shipment->financial_status->value, ['collected', 'settled'], true)) {
            return response()->json(['message' => 'El envío ya fue recaudado o liquidado.'], 422);
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
        if ($shipment->payment_type->value !== 'cash_on_delivery') {
            return response()->json(['message' => 'Solo se puede liquidar recaudo contra entrega.'], 422);
        }

        if ($shipment->financial_status->value !== 'collected') {
            return response()->json(['message' => 'El envío debe estar recaudado antes de liquidar.'], 422);
        }

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
        if ($shipment->driver_paid) {
            return response()->json(['message' => 'Este envío ya fue pagado al conductor.'], 422);
        }

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
        $data = $request->validate([
            'shipment_ids' => ['required', 'array', 'min:1', 'max:100'],
            'shipment_ids.*' => ['exists:shipments,id'],
        ]);

        $count = Shipment::whereIn('id', $data['shipment_ids'])
            ->update(['financial_status' => 'settled']);

        return response()->json([
            'message' => "{$count} envíos liquidados.",
            'count' => $count,
        ]);
    }

    /**
     * Recaudar lote — todos los COD pendientes de un conductor.
     */
    public function collectBatch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'driver_id' => ['required', 'exists:drivers,id'],
        ]);

        $count = Shipment::where('driver_id', $data['driver_id'])
            ->where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'pending')
            ->update(['financial_status' => 'collected']);

        AuditLog::log('financial.collect_batch', null,
            null,
            ['driver_id' => $data['driver_id'], 'count' => $count],
            "Recaudo batch: {$count} envíos del conductor #{$data['driver_id']}"
        );

        return response()->json([
            'message' => "{$count} envíos recaudados.",
            'count' => $count,
        ]);
    }

    /**
     * Pagar lote — todos los envíos entregados sin pagar de un conductor.
     */
    public function driverPaidBatch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'driver_id' => ['required', 'exists:drivers,id'],
        ]);

        $count = Shipment::where('driver_id', $data['driver_id'])
            ->where('status', 'delivered')
            ->where('driver_paid', false)
            ->update(['driver_paid' => true]);

        AuditLog::log('financial.driver_paid_batch', null,
            null,
            ['driver_id' => $data['driver_id'], 'count' => $count],
            "Pago batch conductor: {$count} envíos del conductor #{$data['driver_id']}"
        );

        return response()->json([
            'message' => "{$count} envíos pagados al conductor.",
            'count' => $count,
        ]);
    }

    /**
     * Resumen financiero del día con P&L.
     */
    public function dailySummary(Request $request): JsonResponse
    {
        $date = $request->input('date', now()->toDateString());
        $calculator = new ProfitCalculator();

        return response()->json($calculator->dailySummary($date));
    }

    /**
     * Estado de pérdidas y ganancias por periodo.
     */
    public function profitLoss(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
        ]);

        $calculator = new ProfitCalculator();

        return response()->json($calculator->profitLoss($data['from'], $data['to']));
    }
}
