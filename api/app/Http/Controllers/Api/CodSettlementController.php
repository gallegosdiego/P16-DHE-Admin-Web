<?php

namespace App\Http\Controllers\Api;

use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\CodSettlement;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

    /**
     * Crear conciliación diaria para un conductor.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'driver_id' => ['required', 'exists:drivers,id'],
            'date' => ['required', 'date'],
            'total_settled' => ['required', 'integer', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        return DB::transaction(function () use ($data, $request) {
            // Calcular cuánto cobró el conductor ese día
            $shipments = Shipment::where('driver_id', $data['driver_id'])
                ->where('payment_type', 'cash_on_delivery')
                ->whereIn('financial_status', ['collected', 'settled'])
                ->whereDate('delivered_at', $data['date'])
                ->get();

            $totalCollected = (int) $shipments->sum('cod_amount');
            $totalSettled = (int) $data['total_settled'];
            $difference = $totalCollected - $totalSettled;

            $status = $difference === 0 ? 'settled' : ($totalSettled > 0 ? 'partial' : 'pending');

            $settlement = CodSettlement::create([
                'driver_id' => $data['driver_id'],
                'settlement_date' => $data['date'],
                'total_collected' => $totalCollected,
                'total_settled' => $totalSettled,
                'difference' => $difference,
                'status' => $status,
                'notes' => $data['notes'] ?? null,
                'settled_by' => $request->user()->id,
            ]);

            // Vincular los envíos con esta conciliación
            Shipment::where('driver_id', $data['driver_id'])
                ->where('payment_type', 'cash_on_delivery')
                ->whereIn('financial_status', ['collected', 'settled'])
                ->whereDate('delivered_at', $data['date'])
                ->whereNull('settlement_id')
                ->update(['settlement_id' => $settlement->id]);

            AuditLog::log('financial.cod_settlement', $settlement,
                null,
                ['total_collected' => $totalCollected, 'total_settled' => $totalSettled, 'difference' => $difference],
                "Conciliación COD: conductor #{$data['driver_id']} — diferencia \${$difference}"
            );

            return response()->json($settlement->load('driver:id,name'), 201);
        });
    }

    /**
     * Cerrar conciliación (marcar como liquidada).
     */
    public function close(CodSettlement $settlement): JsonResponse
    {
        if ($settlement->status === 'settled') {
            return response()->json(['message' => 'Esta conciliación ya está cerrada.'], 422);
        }

        $old = $settlement->status;
        $settlement->update(['status' => 'settled']);

        AuditLog::log('financial.settlement_closed', $settlement,
            ['status' => $old],
            ['status' => 'settled'],
            "Conciliación cerrada: {$settlement->settlement_date->format('Y-m-d')}"
        );

        return response()->json($settlement->fresh());
    }
}
