<?php

namespace App\Domain\Financial\Services;

use App\Domain\Financial\Models\ExpensePayment;
use App\Domain\Financial\Models\PayrollPayment;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Support\Carbon;

class FinancialKpiService
{
    /**
     * Calcula todos los KPIs financieros de la operación.
     *
     * Indicadores incluidos:
     * - DSO (Days Sales Outstanding)
     * - Tasa de recaudo COD
     * - Margen promedio por envío
     * - Ratio operacional
     * - Ingreso por entrega
     * - Total cuentas por cobrar
     * - COD pendiente en calle
     * - Ingresos, costos, utilidad y margen mensual
     *
     * @return array<string, mixed>
     */
    public function calculate(): array
    {
        $monthStart = Carbon::now()->startOfMonth()->toDateString();
        $monthEnd   = Carbon::now()->endOfMonth()->toDateString();
        $thirtyDaysAgo = Carbon::now()->subDays(30)->toDateString();

        // ── Datos mensuales (una sola consulta agrupada) ─────────
        $monthlyAgg = Shipment::query()
            ->whereBetween('created_at', [$monthStart, $monthEnd])
            ->selectRaw('
                SUM(shipping_cost)                                    AS total_revenue,
                SUM(driver_fee)                                       AS total_driver_fees,
                SUM(CASE WHEN status = ? THEN shipping_cost - driver_fee ELSE 0 END) AS total_margin_delivered,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END)          AS delivered_count
            ', ['delivered', 'delivered'])
            ->first();

        $monthlyRevenue  = (int) ($monthlyAgg->total_revenue ?? 0);
        $monthlyDriverFees = (int) ($monthlyAgg->total_driver_fees ?? 0);
        $deliveredCount  = (int) ($monthlyAgg->delivered_count ?? 0);
        $totalMarginDelivered = (int) ($monthlyAgg->total_margin_delivered ?? 0);

        // ── Gastos pagados del mes ───────────────────────────────
        $paidExpenses = (int) ExpensePayment::whereBetween('paid_at', [$monthStart, $monthEnd])
            ->where('status', 'paid')
            ->sum('amount');

        $paidPayroll = (int) PayrollPayment::whereBetween('paid_at', [$monthStart, $monthEnd])
            ->where('status', 'paid')
            ->sum('amount');

        $monthlyCosts  = $monthlyDriverFees + $paidExpenses + $paidPayroll;
        $monthlyProfit = $monthlyRevenue - $monthlyCosts;

        // ── DSO: (Cuentas por cobrar / Ventas a crédito 30d) * 30 ─
        $totalReceivable = (int) Shipment::whereIn('payment_type', ['post_sale', 'mercado_libre'])
            ->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
            ->sum('shipping_cost');

        $creditSales30d = (int) Shipment::whereIn('payment_type', ['post_sale', 'mercado_libre'])
            ->where('created_at', '>=', $thirtyDaysAgo)
            ->sum('shipping_cost');

        $dso = $creditSales30d > 0
            ? round(($totalReceivable / $creditSales30d) * 30, 1)
            : 0;

        // ── Tasa de recaudo COD ──────────────────────────────────
        $codAgg = Shipment::where('payment_type', 'cash_on_delivery')
            ->selectRaw('
                SUM(cod_amount) AS total_assigned,
                SUM(CASE WHEN financial_status IN (?, ?) THEN cod_amount ELSE 0 END) AS total_collected
            ', ['collected', 'settled'])
            ->first();

        $codTotalAssigned  = (int) ($codAgg->total_assigned ?? 0);
        $codTotalCollected = (int) ($codAgg->total_collected ?? 0);

        $codCollectionRate = $codTotalAssigned > 0
            ? round(($codTotalCollected / $codTotalAssigned) * 100, 1)
            : 0;

        // ── Margen promedio por envío entregado (mes) ─────────────
        $avgMarginPerShipment = $deliveredCount > 0
            ? round($totalMarginDelivered / $deliveredCount)
            : 0;

        // ── Ratio operacional ────────────────────────────────────
        $operatingRatio = $monthlyRevenue > 0
            ? round($monthlyCosts / $monthlyRevenue, 4)
            : 0;

        // ── Ingreso por entrega ──────────────────────────────────
        $revenuePerDelivery = $deliveredCount > 0
            ? round($monthlyRevenue / $deliveredCount)
            : 0;

        // ── COD pendiente en calle (no recaudado por conductor) ──
        $totalCodInStreet = (int) Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'pending')
            ->sum('cod_amount');

        // ── Margen de utilidad porcentual ─────────────────────────
        $profitMarginPct = $monthlyRevenue > 0
            ? round(($monthlyProfit / $monthlyRevenue) * 100, 1)
            : 0;

        return [
            'dso'                    => $dso,
            'cod_collection_rate'    => $codCollectionRate,
            'avg_margin_per_shipment' => $avgMarginPerShipment,
            'operating_ratio'        => $operatingRatio,
            'revenue_per_delivery'   => $revenuePerDelivery,
            'total_receivable'       => $totalReceivable,
            'total_cod_in_street'    => $totalCodInStreet,
            'monthly_revenue'        => $monthlyRevenue,
            'monthly_costs'          => $monthlyCosts,
            'monthly_profit'         => $monthlyProfit,
            'profit_margin_pct'      => $profitMarginPct,
        ];
    }
}
