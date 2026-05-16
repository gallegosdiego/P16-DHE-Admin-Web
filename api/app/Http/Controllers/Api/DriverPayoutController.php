<?php

namespace App\Http\Controllers\Api;

use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\DriverPayout;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

    /**
     * Generar registro de pago consolidado para un conductor en una fecha.
     */
    public function generate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'driver_id' => ['required', 'exists:drivers,id'],
            'date' => ['required', 'date'],
        ]);

        // Verificar que no exista ya un pago para esta fecha
        $existing = DriverPayout::where('driver_id', $data['driver_id'])
            ->whereDate('payout_date', $data['date'])
            ->first();

        if ($existing) {
            return response()->json([
                'message' => 'Ya existe un registro de pago para este conductor en esta fecha.',
                'payout' => $existing,
            ], 422);
        }

        return DB::transaction(function () use ($data) {
            $shipments = Shipment::where('driver_id', $data['driver_id'])
                ->where('status', 'delivered')
                ->where('driver_paid', false)
                ->whereDate('delivered_at', $data['date'])
                ->get();

            if ($shipments->isEmpty()) {
                return response()->json([
                    'message' => 'No hay envíos entregados sin pagar para este conductor en esta fecha.',
                ], 422);
            }

            $totalAmount = (int) $shipments->sum('driver_fee');

            $payout = DriverPayout::create([
                'driver_id' => $data['driver_id'],
                'payout_date' => $data['date'],
                'packages_count' => $shipments->count(),
                'total_amount' => $totalAmount,
                'status' => 'pending',
            ]);

            // Vincular envíos con este payout
            Shipment::whereIn('id', $shipments->pluck('id'))
                ->update(['payout_id' => $payout->id]);

            AuditLog::log('financial.payout_generated', $payout,
                null,
                ['packages' => $shipments->count(), 'total' => $totalAmount],
                "Pago generado: conductor #{$data['driver_id']} — {$shipments->count()} paquetes — \${$totalAmount}"
            );

            return response()->json($payout->load('driver:id,name'), 201);
        });
    }

    /**
     * Marcar pago como pagado.
     */
    public function markPaid(DriverPayout $payout): JsonResponse
    {
        if ($payout->status === 'paid') {
            return response()->json(['message' => 'Este pago ya fue procesado.'], 422);
        }

        return DB::transaction(function () use ($payout) {
            $payout->update([
                'status' => 'paid',
                'paid_at' => now()->toDateString(),
            ]);

            // Marcar todos los envíos asociados como pagados
            Shipment::where('payout_id', $payout->id)
                ->update(['driver_paid' => true]);

            AuditLog::log('financial.payout_paid', $payout,
                ['status' => 'pending'],
                ['status' => 'paid'],
                "Pago procesado: \${$payout->total_amount} al conductor #{$payout->driver_id}"
            );

            return response()->json($payout->fresh());
        });
    }
}
