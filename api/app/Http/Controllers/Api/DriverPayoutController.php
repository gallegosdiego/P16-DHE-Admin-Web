<?php

namespace App\Http\Controllers\Api;

use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\DriverPayout;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DriverPayoutController extends Controller
{
    /**
     * Lista de pagos a conductores con filtros.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'driver_id' => ['nullable', 'exists:drivers,id'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'status' => ['nullable', 'in:pending,paid'],
        ]);

        $query = DriverPayout::with('driver:id,name')
            ->orderByDesc('payout_date');

        if ($driverId = ($filters['driver_id'] ?? null)) {
            $query->where('driver_id', $driverId);
        }
        if ($from = ($filters['from'] ?? null)) {
            $query->where('payout_date', '>=', $from);
        }
        if ($to = ($filters['to'] ?? null)) {
            $query->where('payout_date', '<=', $to);
        }
        if ($status = ($filters['status'] ?? null)) {
            $query->where('status', $status);
        }

        return response()->json($query->paginate(25));
    }

    /**
     * Conductores con pagos pendientes del día.
     */
    public function pending(Request $request): JsonResponse
    {
        $date = $request->input('date', now()->toDateString());

        $drivers = Driver::where('status', '!=', 'inactive')
            ->get()
            ->map(function (Driver $driver) use ($date) {
                $shipments = Shipment::where('driver_id', $driver->id)
                    ->where('status', 'delivered')
                    ->where('driver_paid', false)
                    ->whereDate('delivered_at', $date)
                    ->get();

                return [
                    'driver_id' => $driver->id,
                    'driver_name' => $driver->name,
                    'packages' => $shipments->count(),
                    'total_fee' => (int) $shipments->sum('driver_fee'),
                    'total_revenue' => (int) $shipments->sum('shipping_cost'),
                ];
            })
            ->filter(fn ($d) => $d['packages'] > 0)
            ->values();

        return response()->json([
            'date' => $date,
            'drivers' => $drivers,
            'total_pending' => $drivers->sum('total_fee'),
        ]);
    }

    // generate() y markPaid() se retiraron en sep-2026: marcaban `driver_paid`
    // sin tocar DriverServiceEarning y permitían pagar dos veces al piloto. El
    // pago se registra en ReconciliationLedgerController::payDriver.
}
