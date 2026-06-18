<?php

namespace App\Domain\Financial\Services;

use App\Domain\Financial\Models\ExpensePayment;
use App\Domain\Financial\Models\PayrollPayment;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Support\Carbon;

class CashFlowService
{
    /**
     * Proyecta el flujo de caja semanal.
     *
     * Utiliza datos históricos de las últimas 4 semanas para calcular
     * promedios de ingresos y egresos semanales, y proyecta hacia adelante.
     * La primera semana usa montos reales pendientes para mayor precisión.
     *
     * @param  int  $weeks  Número de semanas a proyectar (máx 52).
     * @return array{weeks: array}
     */
    public function project(int $weeks = 13): array
    {
        $weeks = min(max($weeks, 1), 52);
        $now   = Carbon::now();

        // ── Promedios históricos (últimas 4 semanas) ─────────────
        $historicalWeeks = 4;
        $histStart = $now->copy()->subWeeks($historicalWeeks)->startOfWeek()->toDateString();
        $histEnd   = $now->copy()->subDay()->toDateString(); // hasta ayer

        $avgInflows  = $this->calculateAverageInflows($histStart, $histEnd, $historicalWeeks);
        $avgOutflows = $this->calculateAverageOutflows($histStart, $histEnd, $historicalWeeks);

        // ── Montos pendientes reales (para semana 1) ─────────────
        $pendingCodCollections = (int) Shipment::where('payment_type', 'cash_on_delivery')
            ->whereIn('financial_status', ['pending', 'collected'])
            ->sum('cod_amount');

        $pendingClientPayments = (int) Shipment::whereIn('payment_type', ['post_sale', 'mercado_libre'])
            ->whereIn('financial_status', ['pending', 'invoiced'])
            ->sum('shipping_cost');

        $pendingDriverPayments = (int) Shipment::where('status', 'delivered')
            ->where('driver_paid', false)
            ->sum('driver_fee');

        // Saldo de apertura: usar COD liquidado no remitido como proxy
        $openingBalance = $pendingCodCollections;

        // ── Construcción de semanas ──────────────────────────────
        $weekProjections = [];
        $balance = $openingBalance;

        for ($i = 1; $i <= $weeks; $i++) {
            $weekStart = $now->copy()->addWeeks($i - 1)->startOfWeek();
            $weekEnd   = $weekStart->copy()->endOfWeek();

            if ($i === 1) {
                // Primera semana: usar montos reales pendientes
                $inflows = [
                    'client_payments'  => (int) round($pendingClientPayments * 0.15),
                    'cod_collections'  => (int) round($pendingCodCollections * 0.7),
                    'other'            => 0,
                ];
                $outflows = [
                    'driver_payments'  => $pendingDriverPayments,
                    'expenses'         => $avgOutflows['expenses'],
                    'payroll'          => $avgOutflows['payroll'],
                    'cod_remittance'   => (int) round($pendingCodCollections * 0.6),
                    'other'            => 0,
                ];
            } else {
                // Semanas proyectadas: usar promedios históricos
                $inflows = [
                    'client_payments'  => $avgInflows['client_payments'],
                    'cod_collections'  => $avgInflows['cod_collections'],
                    'other'            => 0,
                ];
                $outflows = [
                    'driver_payments'  => $avgOutflows['driver_payments'],
                    'expenses'         => $avgOutflows['expenses'],
                    'payroll'          => $avgOutflows['payroll'],
                    'cod_remittance'   => $avgOutflows['cod_remittance'],
                    'other'            => 0,
                ];
            }

            $totalInflows  = array_sum($inflows);
            $totalOutflows = array_sum($outflows);
            $netFlow       = $totalInflows - $totalOutflows;
            $closingBalance = $balance + $netFlow;

            $weekProjections[] = [
                'week_number'     => $i,
                'start_date'      => $weekStart->toDateString(),
                'end_date'        => $weekEnd->toDateString(),
                'opening_balance' => $balance,
                'inflows'         => $inflows,
                'outflows'        => $outflows,
                'net_flow'        => $netFlow,
                'closing_balance' => $closingBalance,
            ];

            $balance = $closingBalance;
        }

        return [
            'weeks' => $weekProjections,
        ];
    }

    /**
     * Calcula los ingresos semanales promedio del periodo histórico.
     *
     * @return array{client_payments: int, cod_collections: int}
     */
    private function calculateAverageInflows(string $from, string $to, int $numWeeks): array
    {
        // Pagos de clientes post-venta que pasaron a settled en el periodo
        $clientPayments = (int) Shipment::whereIn('payment_type', ['post_sale', 'mercado_libre'])
            ->where('financial_status', 'settled')
            ->whereBetween('updated_at', [$from, $to])
            ->sum('shipping_cost');

        // Recaudo COD liquidado en el periodo
        $codCollections = (int) Shipment::where('payment_type', 'cash_on_delivery')
            ->whereIn('financial_status', ['collected', 'settled'])
            ->whereBetween('updated_at', [$from, $to])
            ->sum('cod_amount');

        $divisor = max($numWeeks, 1);

        return [
            'client_payments' => (int) round($clientPayments / $divisor),
            'cod_collections' => (int) round($codCollections / $divisor),
        ];
    }

    /**
     * Calcula los egresos semanales promedio del periodo histórico.
     *
     * @return array{driver_payments: int, expenses: int, payroll: int, cod_remittance: int}
     */
    private function calculateAverageOutflows(string $from, string $to, int $numWeeks): array
    {
        // Pagos a conductores en el periodo
        $driverPayments = (int) Shipment::where('driver_paid', true)
            ->whereBetween('updated_at', [$from, $to])
            ->sum('driver_fee');

        // Gastos fijos pagados en el periodo
        $expenses = (int) ExpensePayment::where('status', 'paid')
            ->whereBetween('paid_at', [$from, $to])
            ->sum('amount');

        // Nómina pagada en el periodo
        $payroll = (int) PayrollPayment::where('status', 'paid')
            ->whereBetween('paid_at', [$from, $to])
            ->sum('amount');

        // COD remitido a clientes (envíos COD que pasaron a settled)
        $codRemittance = (int) Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'settled')
            ->whereBetween('updated_at', [$from, $to])
            ->sum('cod_amount');

        $divisor = max($numWeeks, 1);

        return [
            'driver_payments' => (int) round($driverPayments / $divisor),
            'expenses'        => (int) round($expenses / $divisor),
            'payroll'         => (int) round($payroll / $divisor),
            'cod_remittance'  => (int) round($codRemittance / $divisor),
        ];
    }
}
