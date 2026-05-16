<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Models\Shipment;
use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\ExpensePayment;
use App\Domain\Financial\Models\PayrollPayment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    private function csvCell(mixed $value): string
    {
        $text = (string) ($value ?? '');

        return '"' . str_replace('"', '""', $text) . '"';
    }

    private function resolvePeriod(Request $request): array
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $from = $validated['from'] ?? now()->startOfMonth()->toDateString();
        $to = $validated['to'] ?? now()->toDateString();

        return [$from, $to];
    }

    /**
     * Estadísticas globales para el módulo de reportes.
     */
    public function stats(Request $request): JsonResponse
    {
        [$from, $to] = $this->resolvePeriod($request);

        $shipments = Shipment::whereBetween('created_at', ["{$from} 00:00:00", "{$to} 23:59:59"]);

        $total = (clone $shipments)->count();
        $delivered = (clone $shipments)->where('status', 'delivered')->count();
        $issues = (clone $shipments)->where('status', 'issue')->count();
        $returned = (clone $shipments)->where('status', 'returned')->count();
        $cancelled = (clone $shipments)->where('status', 'cancelled')->count();

        $revenue = (int) (clone $shipments)->sum('shipping_cost');
        $driverCost = (int) (clone $shipments)->sum('driver_fee');
        $codCollected = (int) (clone $shipments)->where('payment_type', 'cash_on_delivery')
            ->whereIn('financial_status', ['collected', 'settled'])
            ->sum('cod_amount');

        // Por conductor
        $byDriver = Driver::withCount(['shipments as total_shipments' => fn ($q) =>
            $q->whereBetween('created_at', ["{$from} 00:00:00", "{$to} 23:59:59"])
        ])
        ->withCount(['shipments as delivered_count' => fn ($q) =>
            $q->where('status', 'delivered')
              ->whereBetween('created_at', ["{$from} 00:00:00", "{$to} 23:59:59"])
        ])
        ->withSum(['shipments as revenue' => fn ($q) =>
            $q->whereBetween('created_at', ["{$from} 00:00:00", "{$to} 23:59:59"])
        ], 'shipping_cost')
        ->withSum(['shipments as driver_earnings' => fn ($q) =>
            $q->whereBetween('created_at', ["{$from} 00:00:00", "{$to} 23:59:59"])
        ], 'driver_fee')
        ->orderBy('name')
        ->get()
        ->map(fn ($d) => [
            'id' => $d->id,
            'name' => $d->name,
            'total' => $d->total_shipments,
            'delivered' => $d->delivered_count,
            'delivery_rate' => $d->total_shipments > 0
                ? round(($d->delivered_count / $d->total_shipments) * 100, 1)
                : 0,
            'revenue' => (int) ($d->revenue ?? 0),
            'earnings' => (int) ($d->driver_earnings ?? 0),
        ]);

        // Por cliente
        $byClient = Client::withCount(['shipments as total_shipments' => fn ($q) =>
            $q->whereBetween('created_at', ["{$from} 00:00:00", "{$to} 23:59:59"])
        ])
        ->withSum(['shipments as total_revenue' => fn ($q) =>
            $q->whereBetween('created_at', ["{$from} 00:00:00", "{$to} 23:59:59"])
        ], 'shipping_cost')
        ->orderByDesc('total_shipments')
        ->limit(10)
        ->get()
        ->map(fn ($c) => [
            'id' => $c->id,
            'name' => $c->name,
            'company' => $c->company,
            'total' => $c->total_shipments,
            'revenue' => (int) ($c->total_revenue ?? 0),
        ]);

        // Por estado
        $byStatus = (clone $shipments)->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return response()->json([
            'period' => ['from' => $from, 'to' => $to],
            'summary' => [
                'total' => $total,
                'delivered' => $delivered,
                'delivery_rate' => $total > 0 ? round(($delivered / $total) * 100, 1) : 0,
                'issues' => $issues,
                'returned' => $returned,
                'cancelled' => $cancelled,
                'revenue' => $revenue,
                'driver_cost' => $driverCost,
                'profit' => $revenue - $driverCost,
                'cod_collected' => $codCollected,
            ],
            'by_status' => $byStatus,
            'by_driver' => $byDriver,
            'by_client' => $byClient,
        ]);
    }

    /**
     * Exportar envíos como CSV.
     */
    public function exportShipments(Request $request): Response
    {
        [$from, $to] = $this->resolvePeriod($request);

        $shipments = Shipment::with(['client:id,name,company', 'driver:id,name'])
            ->whereBetween('created_at', ["{$from} 00:00:00", "{$to} 23:59:59"])
            ->orderByDesc('created_at')
            ->get();

        $csv = "Guía,Fecha,Cliente,Empresa,Destinatario,Teléfono,Dirección,Estado,Tipo Pago,Flete,COD,Conductor,Estado Financiero\n";

        foreach ($shipments as $s) {
            $financialStatus = $s->financial_status;
            $financialStatusStr = is_object($financialStatus) ? $financialStatus->value : (string) $financialStatus;
            $statusStr = is_object($s->status) ? $s->status->value : (string) $s->status;
            $paymentTypeStr = is_object($s->payment_type) ? $s->payment_type->value : (string) $s->payment_type;

            $csv .= implode(',', [
                $s->display_code,
                $s->created_at->format('Y-m-d H:i'),
                '"' . str_replace('"', '""', $s->client?->name ?? '') . '"',
                '"' . str_replace('"', '""', $s->client?->company ?? '') . '"',
                '"' . str_replace('"', '""', $s->recipient_name) . '"',
                $s->recipient_phone,
                '"' . str_replace('"', '""', $s->recipient_address) . '"',
                $statusStr,
                $paymentTypeStr,
                $s->shipping_cost,
                $s->cod_amount ?? 0,
                '"' . str_replace('"', '""', $s->driver?->name ?? 'Sin asignar') . '"',
                $financialStatusStr,
            ]) . "\n";
        }

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=envios_{$from}_{$to}.csv",
        ]);
    }

    /**
     * Exportar resumen financiero como CSV.
     */
    public function exportFinancial(Request $request): Response
    {
        [$from, $to] = $this->resolvePeriod($request);

        $drivers = Driver::with(['shipments' => fn ($q) =>
            $q->whereBetween('created_at', ["{$from} 00:00:00", "{$to} 23:59:59"])
        ])->orderBy('name')->get();

        $csv = "Conductor,Envíos,Entregados,Tasa,Ingresos,Costo Conductor,Ganancia,COD Pendiente,COD Cobrado\n";

        foreach ($drivers as $d) {
            $shipments = $d->shipments;
            $total = $shipments->count();
            $delivered = $shipments->where('status', 'delivered')->count();
            $revenue = $shipments->sum('shipping_cost');
            $driverCost = $shipments->sum('driver_fee');
            $codPending = $shipments->where('payment_type', 'cash_on_delivery')
                ->where('financial_status', 'pending')->sum('cod_amount');
            $codCollected = $shipments->where('payment_type', 'cash_on_delivery')
                ->whereIn('financial_status', ['collected', 'settled'])->sum('cod_amount');

            $csv .= implode(',', [
                '"' . $d->name . '"',
                $total,
                $delivered,
                $total > 0 ? round(($delivered / $total) * 100, 1) . '%' : '0%',
                $revenue,
                $driverCost,
                $revenue - $driverCost,
                $codPending,
                $codCollected,
            ]) . "\n";
        }

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=financiero_{$from}_{$to}.csv",
        ]);
    }

    public function exportReceivables(): StreamedResponse
    {
        $clients = Client::where('billing_type', 'post_sale')
            ->where('is_active', true)
            ->with(['shipments' => function ($q) {
                $q->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
                    ->select('id', 'client_id', 'shipping_cost', 'created_at');
            }])
            ->orderBy('name')
            ->get();

        $filename = 'cuentas_por_cobrar_' . now()->format('Ymd_His') . '.csv';

        return response()->streamDownload(function () use ($clients) {
            echo "cliente,empresa,telefono,envios_pendientes,total_deuda,dias_mas_antiguo\n";

            foreach ($clients as $client) {
                $unpaid = $client->shipments;
                $totalOwed = (int) $unpaid->sum('shipping_cost');
                if ($totalOwed <= 0) {
                    continue;
                }
                $oldest = $unpaid->sortBy('created_at')->first();
                $oldestDays = $oldest ? (int) now()->diffInDays($oldest->created_at) : 0;

                echo implode(',', [
                    $this->csvCell($client->name),
                    $this->csvCell($client->company),
                    $this->csvCell($client->phone),
                    (string) $unpaid->count(),
                    (string) $totalOwed,
                    (string) $oldestDays,
                ]) . "\n";
            }
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    public function exportPayroll(Request $request): StreamedResponse
    {
        [$from, $to] = $this->resolvePeriod($request);
        $payments = PayrollPayment::with('employee:id,name,position,salary')
            ->whereBetween('period_end', ["{$from} 00:00:00", "{$to} 23:59:59"])
            ->orderByDesc('period_end')
            ->get();

        return response()->streamDownload(function () use ($payments) {
            echo "empleado,cargo,salario,periodo_inicio,periodo_fin,pagado_el,monto\n";
            foreach ($payments as $payment) {
                echo implode(',', [
                    $this->csvCell($payment->employee?->name),
                    $this->csvCell($payment->employee?->position),
                    (string) (int) ($payment->employee?->salary ?? 0),
                    $this->csvCell(optional($payment->period_start)->format('Y-m-d')),
                    $this->csvCell(optional($payment->period_end)->format('Y-m-d')),
                    $this->csvCell(optional($payment->paid_at)->format('Y-m-d')),
                    (string) (int) $payment->amount,
                ]) . "\n";
            }
        }, "nomina_{$from}_{$to}.csv", [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    public function exportExpenses(Request $request): StreamedResponse
    {
        [$from, $to] = $this->resolvePeriod($request);
        $payments = ExpensePayment::with('expense:id,name')
            ->whereBetween('period_date', ["{$from} 00:00:00", "{$to} 23:59:59"])
            ->orderByDesc('period_date')
            ->get();

        return response()->streamDownload(function () use ($payments) {
            echo "gasto,monto,periodo,estado,pagado_el\n";
            foreach ($payments as $payment) {
                echo implode(',', [
                    $this->csvCell($payment->expense?->name),
                    (string) (int) $payment->amount,
                    $this->csvCell(optional($payment->period_date)->format('Y-m-d')),
                    $this->csvCell($payment->status),
                    $this->csvCell(optional($payment->paid_at)->format('Y-m-d')),
                ]) . "\n";
            }
        }, "gastos_{$from}_{$to}.csv", [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
