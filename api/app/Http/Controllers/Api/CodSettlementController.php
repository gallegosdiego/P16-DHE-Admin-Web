<?php

namespace App\Http\Controllers\Api;

use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\CodSettlement;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CodSettlementController extends Controller
{
    /**
     * Lista de conciliaciones con filtro por conductor y fecha.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'driver_id' => ['nullable', 'exists:drivers,id'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'status' => ['nullable', 'in:pending,partial,settled'],
        ]);

        $query = CodSettlement::with('driver:id,name')
            ->orderByDesc('settlement_date');

        if ($driverId = ($filters['driver_id'] ?? null)) {
            $query->where('driver_id', $driverId);
        }
        if ($from = ($filters['from'] ?? null)) {
            $query->where('settlement_date', '>=', $from);
        }
        if ($to = ($filters['to'] ?? null)) {
            $query->where('settlement_date', '<=', $to);
        }
        if ($status = ($filters['status'] ?? null)) {
            $query->where('status', $status);
        }

        return response()->json($query->paginate(25));
    }

    /**
     * Resumen diario de COD por conductor.
     */
    public function dailySummary(Request $request): JsonResponse
    {
        $date = $request->validate([
            'date' => ['nullable', 'date'],
        ])['date'] ?? now()->toDateString();

        $drivers = Driver::where('status', '!=', 'inactive')
            ->get()
            ->map(function (Driver $driver) use ($date) {
                $shipments = Shipment::where('driver_id', $driver->id)
                    ->where('payment_type', 'cash_on_delivery')
                    ->whereDate('delivered_at', $date)
                    ->get();

                $totalExpected = $shipments->sum('cod_amount');
                $collected = $shipments->where('financial_status', 'collected')->sum('cod_amount')
                    + $shipments->where('financial_status', 'settled')->sum('cod_amount');
                $pending = $shipments->where('financial_status', 'pending')->sum('cod_amount');

                return [
                    'driver_id' => $driver->id,
                    'driver_name' => $driver->name,
                    'packages' => $shipments->count(),
                    'total_expected' => (int) $totalExpected,
                    'collected' => (int) $collected,
                    'pending' => (int) $pending,
                    'difference' => (int) ($totalExpected - $collected),
                ];
            })
            ->filter(fn ($d) => $d['packages'] > 0)
            ->values();

        return response()->json([
            'date' => $date,
            'drivers' => $drivers,
            'totals' => [
                'total_expected' => $drivers->sum('total_expected'),
                'total_collected' => $drivers->sum('collected'),
                'total_pending' => $drivers->sum('pending'),
            ],
        ]);
    }

    // store() y close() se retiraron en sep-2026: la entrega de efectivo del
    // piloto se registra en el libro (ReconciliationLedgerController::remitCod).
    // Las rutas responden 410 vía RetiredFinancialActionController.
}
