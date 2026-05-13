<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Models\Shipment;
use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ReportController extends Controller
{
    /**
     * Estadísticas globales para el módulo de reportes.
     */
    public function stats(Request $request): JsonResponse
    {
        $from = $request->query('from', now()->startOfMonth()->toDateString());
        $to = $request->query('to', now()->toDateString());

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
        $from = $request->query('from', now()->startOfMonth()->toDateString());
        $to = $request->query('to', now()->toDateString());

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
        $from = $request->query('from', now()->startOfMonth()->toDateString());
        $to = $request->query('to', now()->toDateString());

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
}
