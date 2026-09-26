<?php

namespace App\Http\Controllers\Api;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Services\AgingReportService;
use App\Domain\Financial\Services\CashFlowService;
use App\Domain\Financial\Services\FinancialKpiService;
use App\Domain\Financial\Services\ProfitCalculator;
use App\Domain\Financial\Models\DriverServiceEarning;
use App\Domain\Financial\Models\FixedExpense;
use App\Domain\Shared\Models\Zone;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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

        // Pendiente a pilotos: saldo de servicios del libro de Conciliación.
        $driversPending = array_sum(DriverServiceEarning::pendingPayableByDriver());

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

        // «Por pagar» sale del libro de Conciliación, no de `driver_paid`.
        $pendingPayable = DriverServiceEarning::pendingPayableByDriver();

        $payload = $drivers->map(function ($driver) use ($pendingPayable) {
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
                'unpaid_fees' => $pendingPayable[$driver->id] ?? 0,
                'collect_shipment_id' => $collectShipmentId,
                'settle_shipment_id' => $settleShipmentId,
                'driver_paid_shipment_id' => $driverPaidShipmentId,
            ];
        });

        return response()->json($payload);
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

    // ── KPIs, Aging, Cash Flow, Rentabilidad, Liquidación ────

    /**
     * KPIs financieros consolidados de la operación.
     */
    public function kpis(): JsonResponse
    {
        $service = new FinancialKpiService();

        return response()->json($service->calculate());
    }

    /**
     * Reporte de antigüedad de cuentas por cobrar.
     */
    public function agingReport(): JsonResponse
    {
        $service = new AgingReportService();

        return response()->json($service->generate());
    }

    /**
     * Proyección de flujo de caja semanal.
     *
     * @queryParam weeks int Semanas a proyectar (1-52, default 13).
     */
    public function cashFlow(Request $request): JsonResponse
    {
        $weeks   = (int) $request->input('weeks', 13);
        $service = new CashFlowService();

        return response()->json($service->project($weeks));
    }

    /**
     * Rentabilidad agrupada por zona de destino.
     *
     * Agrupa envíos entregados por recipient_zone y calcula
     * ingresos, costos, utilidad y margen porcentual.
     */
    public function profitabilityByZone(): JsonResponse
    {
        $zones = Shipment::query()
            ->where('status', 'delivered')
            ->whereNotNull('recipient_zone')
            ->groupBy('recipient_zone')
            ->selectRaw('
                recipient_zone                          AS zone_name,
                COUNT(*)                                AS total_shipments,
                SUM(shipping_cost)                      AS total_revenue,
                SUM(driver_fee)                         AS total_cost,
                SUM(shipping_cost) - SUM(driver_fee)    AS profit
            ')
            ->orderByDesc('profit')
            ->get()
            ->map(function ($row) {
                $row->margin_pct = $row->total_revenue > 0
                    ? round(($row->profit / $row->total_revenue) * 100, 1)
                    : 0;
                return $row;
            });

        return response()->json($zones);
    }

    /**
     * Rentabilidad agrupada por conductor.
     *
     * Agrupa envíos entregados por driver_id y calcula costos,
     * ingresos generados y costo promedio por entrega.
     */
    public function profitabilityByDriver(): JsonResponse
    {
        $drivers = Shipment::query()
            ->where('status', 'delivered')
            ->whereNotNull('driver_id')
            ->join('drivers', 'shipments.driver_id', '=', 'drivers.id')
            ->groupBy('shipments.driver_id', 'drivers.name')
            ->selectRaw('
                shipments.driver_id,
                drivers.name                            AS driver_name,
                COUNT(*)                                AS total_shipments,
                SUM(shipments.shipping_cost)            AS total_revenue,
                SUM(shipments.driver_fee)               AS total_paid,
                SUM(shipments.shipping_cost)            AS revenue_generated
            ')
            ->orderByDesc('total_revenue')
            ->get()
            ->map(function ($row) {
                $row->cost_per_delivery = $row->total_shipments > 0
                    ? round($row->total_paid / $row->total_shipments)
                    : 0;
                return $row;
            });

        return response()->json($drivers);
    }

    /**
     * Rentabilidad agrupada por cliente.
     *
     * Incluye total de envíos, ingresos, deuda pendiente
     * (post-venta no pagada) y si el cliente es rentable.
     */
    public function profitabilityByClient(): JsonResponse
    {
        $clients = Client::query()
            ->withCount('shipments as total_shipments')
            ->withSum('shipments as total_revenue', 'shipping_cost')
            ->withSum(['shipments as total_owed' => fn ($q) =>
                $q->where('payment_type', 'post_sale')
                  ->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
            ], 'shipping_cost')
            ->having('total_shipments', '>', 0)
            ->orderByDesc('total_revenue')
            ->get()
            ->map(function ($client) {
                return [
                    'client_id'       => $client->id,
                    'client_name'     => $client->name,
                    'company'         => $client->company,
                    'total_shipments' => (int) $client->total_shipments,
                    'total_revenue'   => (int) ($client->total_revenue ?? 0),
                    'total_owed'      => (int) ($client->total_owed ?? 0),
                    'is_profitable'   => ((int) ($client->total_revenue ?? 0)) > 0,
                ];
            });

        return response()->json($clients);
    }

    /**
     * Liquidación detallada de un conductor para un rango de fechas.
     *
     * @queryParam from date Fecha inicio (requerida).
     * @queryParam to   date Fecha fin (requerida).
     */
    public function driverSettlement(Request $request, Driver $driver): JsonResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date'],
            'to'   => ['required', 'date', 'after_or_equal:from'],
        ]);

        $from = $data['from'];
        $to   = $data['to'];

        $shipments = Shipment::where('driver_id', $driver->id)
            ->where('status', 'delivered')
            ->whereBetween('delivered_at', [$from, $to])
            ->orderBy('delivered_at')
            ->get();

        $deliveries = $shipments->map(fn ($s) => [
            'id'               => $s->id,
            'display_code'     => $s->display_code,
            'delivered_at'     => $s->delivered_at?->toDateTimeString(),
            'shipping_cost'    => (int) $s->shipping_cost,
            'driver_fee'       => (int) $s->driver_fee,
            'payment_type'     => $s->payment_type,
            'financial_status' => $s->financial_status,
        ]);

        $totalDriverFee = (int) $shipments->sum('driver_fee');

        // COD manejado por el conductor en el periodo
        $codShipments   = $shipments->filter(fn ($s) => $s->payment_type->value === 'cash_on_delivery');
        $totalCodHandled = (int) $codShipments->sum('cod_amount');
        $totalCodDeposited = (int) $codShipments
            ->filter(fn ($s) => in_array($s->financial_status->value, ['collected', 'settled']))
            ->sum('cod_amount');

        return response()->json([
            'driver' => [
                'id'   => $driver->id,
                'name' => $driver->name,
            ],
            'period' => [
                'from' => $from,
                'to'   => $to,
            ],
            'deliveries' => $deliveries,
            'totals' => [
                'total_packages'   => $shipments->count(),
                'total_driver_fee' => $totalDriverFee,
                'bonuses'          => 0,
                'deductions'       => 0,
                'net_pay'          => $totalDriverFee,
            ],
            'cod_summary' => [
                'total_cod_handled'   => $totalCodHandled,
                'total_cod_deposited' => $totalCodDeposited,
                'difference'          => $totalCodHandled - $totalCodDeposited,
            ],
        ]);
    }

    /**
     * Alertas financieras activas.
     *
     * Retorna un array de alertas relevantes para la operación:
     * - Clientes con deuda vencida (overdue)
     * - COD sin depositar > 24 horas
     * - Gastos que vencen esta semana
     * - Conductores con > $100.000 COP de COD en calle
     */
    public function alerts(): JsonResponse
    {
        $alerts = [];

        // 1. Clientes con envíos overdue
        $overdueClients = Shipment::where('payment_type', 'post_sale')
            ->where('financial_status', 'overdue')
            ->distinct('client_id')
            ->count('client_id');

        if ($overdueClients > 0) {
            $alerts[] = [
                'type'    => 'overdue_clients',
                'level'   => 'warning',
                'message' => "{$overdueClients} cliente(s) con cartera vencida.",
                'count'   => $overdueClients,
            ];
        }

        // 2. COD sin depositar > 24 horas
        $codNotDeposited = Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'collected')
            ->where('updated_at', '<', Carbon::now()->subHours(24))
            ->count();

        if ($codNotDeposited > 0) {
            $alerts[] = [
                'type'    => 'cod_not_deposited',
                'level'   => 'danger',
                'message' => "{$codNotDeposited} envío(s) COD recaudados sin depositar (>24h).",
                'count'   => $codNotDeposited,
            ];
        }

        // 3. Gastos que vencen esta semana
        $today    = Carbon::now()->day;
        $weekEnd  = Carbon::now()->addDays(7)->day;
        $dueExpenses = FixedExpense::active()
            ->whereNotNull('due_day')
            ->where('due_day', '>=', $today)
            ->where('due_day', '<=', $weekEnd)
            ->count();

        if ($dueExpenses > 0) {
            $alerts[] = [
                'type'    => 'expenses_due',
                'level'   => 'info',
                'message' => "{$dueExpenses} gasto(s) fijo(s) vencen esta semana.",
                'count'   => $dueExpenses,
            ];
        }

        // 4. Conductores con > $100.000 COP de COD en calle
        $driversHighCod = Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'pending')
            ->whereNotNull('driver_id')
            ->groupBy('driver_id')
            ->havingRaw('SUM(cod_amount) > ?', [100000])
            ->select('driver_id', DB::raw('SUM(cod_amount) as total_cod'))
            ->get();

        if ($driversHighCod->isNotEmpty()) {
            $alerts[] = [
                'type'    => 'drivers_high_cod',
                'level'   => 'warning',
                'message' => $driversHighCod->count() . " conductor(es) con >\$100.000 COD en calle.",
                'count'   => $driversHighCod->count(),
                'details' => $driversHighCod->map(fn ($row) => [
                    'driver_id' => $row->driver_id,
                    'total_cod' => (int) $row->total_cod,
                ]),
            ];
        }

        return response()->json($alerts);
    }
}
