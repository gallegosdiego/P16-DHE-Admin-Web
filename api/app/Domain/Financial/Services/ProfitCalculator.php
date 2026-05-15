<?php

namespace App\Domain\Financial\Services;

use App\Domain\Financial\Models\FixedExpense;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Support\Facades\DB;

class ProfitCalculator
{
    /**
     * Resumen financiero del día.
     */
    public function dailySummary(string $date): array
    {
        $today = $date;
        $weekStart = now()->parse($date)->startOfWeek()->toDateString();
        $monthStart = now()->parse($date)->startOfMonth()->toDateString();

        return [
            'date' => $today,
            'packages' => $this->packageCounts($today, $weekStart, $monthStart),
            'revenue' => $this->revenueSummary($monthStart),
            'cod' => $this->codSummary($today),
            'receivables' => $this->receivableSummary(),
            'outsourcing' => $this->outsourcingSummary($monthStart),
        ];
    }

    /**
     * P&L por periodo.
     */
    public function profitLoss(string $from, string $to): array
    {
        $shipments = Shipment::whereBetween('created_at', [$from, $to])->get();

        // Ingresos
        $directRevenue = $shipments->where('is_outsourced', false)->sum('shipping_cost');
        $outsourceRevenue = $shipments->where('is_outsourced', true)->sum('outsource_amount');
        $grossIncome = $directRevenue + $outsourceRevenue;

        // Costos
        $driverCost = (int) $shipments->sum('driver_fee');
        $fixedExpenses = (int) DB::table('expense_payments')
            ->whereBetween('paid_at', [$from, $to])
            ->where('status', 'paid')
            ->sum('amount');
        $payroll = (int) DB::table('payroll_payments')
            ->whereBetween('paid_at', [$from, $to])
            ->where('status', 'paid')
            ->sum('amount');

        $totalCosts = $driverCost + $fixedExpenses + $payroll;
        $netProfit = $grossIncome - $totalCosts;

        return [
            'period' => ['from' => $from, 'to' => $to],
            'income' => [
                'direct_revenue' => (int) $directRevenue,
                'outsource_revenue' => (int) $outsourceRevenue,
                'gross_income' => (int) $grossIncome,
            ],
            'costs' => [
                'driver_fees' => $driverCost,
                'fixed_expenses' => $fixedExpenses,
                'payroll' => $payroll,
                'total_costs' => $totalCosts,
            ],
            'net_profit' => $netProfit,
            'margin_percent' => $grossIncome > 0
                ? round(($netProfit / $grossIncome) * 100, 1)
                : 0,
        ];
    }

    // ── Helpers privados ──────────────────────────

    private function packageCounts(string $today, string $weekStart, string $monthStart): array
    {
        return [
            'total_today' => Shipment::whereDate('created_at', $today)->count(),
            'delivered_today' => Shipment::where('status', 'delivered')->whereDate('delivered_at', $today)->count(),
            'total_week' => Shipment::where('created_at', '>=', $weekStart)->count(),
            'total_month' => Shipment::where('created_at', '>=', $monthStart)->count(),
        ];
    }

    private function revenueSummary(string $monthStart): array
    {
        $monthShipments = Shipment::where('created_at', '>=', $monthStart);
        $grossIncome = (int) $monthShipments->sum('shipping_cost');
        $driverCost = (int) $monthShipments->sum('driver_fee');
        $grossProfit = $grossIncome - $driverCost;

        $fixedExpensesMonth = (int) FixedExpense::active()->sum('amount');
        $payrollMonth = (int) DB::table('employees')
            ->where('is_active', true)
            ->whereNull('deleted_at')
            ->sum('salary');

        return [
            'gross_income' => $grossIncome,
            'driver_cost' => $driverCost,
            'gross_profit' => $grossProfit,
            'fixed_expenses_month' => $fixedExpensesMonth,
            'payroll_month' => $payrollMonth,
        ];
    }

    private function codSummary(string $today): array
    {
        $codToday = Shipment::where('payment_type', 'cash_on_delivery')
            ->whereDate('delivered_at', $today);

        return [
            'collected_today' => (int) (clone $codToday)->whereIn('financial_status', ['collected', 'settled'])->sum('cod_amount'),
            'pending_today' => (int) (clone $codToday)->where('financial_status', 'pending')->sum('cod_amount'),
            'drivers_with_cash' => (int) Shipment::where('payment_type', 'cash_on_delivery')
                ->where('financial_status', 'collected')
                ->distinct('driver_id')
                ->count('driver_id'),
        ];
    }

    private function receivableSummary(): array
    {
        $overdue = Shipment::where('payment_type', 'post_sale')
            ->whereIn('financial_status', ['pending', 'invoiced', 'overdue']);

        $oldest = Shipment::where('payment_type', 'post_sale')
            ->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
            ->orderBy('created_at')
            ->first();

        return [
            'total_owed' => (int) $overdue->sum('shipping_cost'),
            'overdue_count' => (int) Shipment::where('payment_type', 'post_sale')
                ->where('financial_status', 'overdue')
                ->count(),
            'oldest_days' => $oldest ? (int) now()->diffInDays($oldest->created_at) : 0,
        ];
    }

    private function outsourcingSummary(string $monthStart): array
    {
        $outsourced = Shipment::where('is_outsourced', true)
            ->where('created_at', '>=', $monthStart);

        $serviceIncome = (int) $outsourced->sum('outsource_amount');
        $driverCost = (int) $outsourced->sum('driver_fee');

        return [
            'service_income' => $serviceIncome,
            'driver_cost' => $driverCost,
            'profit' => $serviceIncome - $driverCost,
            'packages' => (int) $outsourced->count(),
        ];
    }
}
