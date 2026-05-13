<?php

namespace App\Http\Controllers\Api;

use App\Domain\Driver\Models\Driver;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DriverController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Driver::withCount([
            'shipments as active_shipments_count' => function ($q) {
                $q->whereNotIn('status', ['delivered', 'returned', 'cancelled']);
            },
            'shipments as delivered_today_count' => function ($q) {
                $q->where('status', 'delivered')
                  ->whereDate('delivered_at', now()->toDateString());
            },
        ]);

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%")
                  ->orWhere('plate', 'like', "%{$search}%");
            });
        }

        $drivers = $query->orderBy('name')->get();

        return response()->json($drivers);
    }

    public function show(Driver $driver): JsonResponse
    {
        $driver->load(['shipments' => function ($q) {
            $q->whereDate('created_at', now()->toDateString())
              ->with('client:id,name');
        }]);

        // Resumen financiero del conductor
        $today = now()->toDateString();
        $driver->setAttribute('today_summary', [
            'assigned' => $driver->shipments()->whereDate('created_at', $today)->count(),
            'delivered' => $driver->shipments()->where('status', 'delivered')->whereDate('delivered_at', $today)->count(),
            'cash_collected' => (int) $driver->shipments()
                ->where('payment_type', 'cash_on_delivery')
                ->where('financial_status', 'collected')
                ->whereDate('updated_at', $today)
                ->sum('cod_amount'),
            'pending_cash' => (int) $driver->pendingCashCollection(),
            'earnings' => (int) $driver->shipments()->whereDate('created_at', $today)->sum('driver_fee'),
        ]);

        return response()->json($driver);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'string', 'max:24'],
            'vehicle' => ['nullable', 'string', 'max:80'],
            'plate' => ['nullable', 'string', 'max:16'],
            'zone' => ['nullable', 'string', 'max:60'],
            'per_package_rate' => ['nullable', 'integer', 'min:0'],
            'daily_rate' => ['nullable', 'integer', 'min:0'],
        ]);

        // Generar iniciales automáticamente
        $names = explode(' ', $validated['name']);
        $validated['initials'] = strtoupper(
            substr($names[0], 0, 1) . (isset($names[1]) ? substr($names[1], 0, 1) : '')
        );

        $driver = Driver::create($validated);

        return response()->json($driver, 201);
    }

    public function update(Request $request, Driver $driver): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'phone' => ['sometimes', 'string', 'max:24'],
            'vehicle' => ['nullable', 'string', 'max:80'],
            'plate' => ['nullable', 'string', 'max:16'],
            'zone' => ['nullable', 'string', 'max:60'],
            'status' => ['sometimes', 'in:active,route,inactive'],
            'per_package_rate' => ['nullable', 'integer', 'min:0'],
            'daily_rate' => ['nullable', 'integer', 'min:0'],
        ]);

        // Recalcular iniciales si cambió el nombre
        if (isset($validated['name'])) {
            $names = explode(' ', $validated['name']);
            $validated['initials'] = strtoupper(
                substr($names[0], 0, 1) . (isset($names[1]) ? substr($names[1], 0, 1) : '')
            );
        }

        $driver->update($validated);

        return response()->json($driver->fresh());
    }

    public function toggleStatus(Driver $driver): JsonResponse
    {
        $newStatus = $driver->status === 'active' ? 'inactive' : 'active';
        $driver->update(['status' => $newStatus]);

        return response()->json($driver->fresh());
    }
}
