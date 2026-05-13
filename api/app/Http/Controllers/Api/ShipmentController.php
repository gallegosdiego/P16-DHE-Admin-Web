<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Actions\CreateShipment;
use App\Domain\Shipment\Actions\TransitionShipmentStatus;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShipmentController extends Controller
{
    /**
     * Lista de envíos con filtros y paginación.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Shipment::with(['client:id,name,phone', 'driver:id,name,initials,phone']);

        // Filtros
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($driver = $request->query('driver_id')) {
            $query->where('driver_id', $driver);
        }
        if ($client = $request->query('client_id')) {
            $query->where('client_id', $client);
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('display_code', 'like', "%{$search}%")
                  ->orWhere('tracking_code', 'like', "%{$search}%")
                  ->orWhere('recipient_name', 'like', "%{$search}%")
                  ->orWhere('recipient_phone', 'like', "%{$search}%")
                  ->orWhere('recipient_address', 'like', "%{$search}%")
                  ->orWhereHas('client', fn ($q) => $q->where('name', 'like', "%{$search}%"));
            });
        }
        if ($financialStatus = $request->query('financial_status')) {
            $query->where('financial_status', $financialStatus);
        }
        if ($paymentType = $request->query('payment_type')) {
            $query->where('payment_type', $paymentType);
        }
        if ($dateFrom = $request->query('date_from')) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }
        if ($dateTo = $request->query('date_to')) {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        $shipments = $query->orderByDesc('created_at')
            ->paginate($request->query('per_page', 25));

        return response()->json($shipments);
    }

    /**
     * Detalle de un envío con timeline.
     */
    public function show(Shipment $shipment): JsonResponse
    {
        $shipment->load(['client', 'driver', 'events.user:id,name', 'createdBy:id,name']);

        return response()->json($shipment);
    }

    /**
     * Crear nuevo envío.
     */
    public function store(Request $request, CreateShipment $action): JsonResponse
    {
        $validated = $request->validate([
            'client_id' => ['required', 'exists:clients,id'],
            'driver_id' => ['nullable', 'exists:drivers,id'],
            'recipient_name' => ['required', 'string', 'max:100'],
            'recipient_phone' => ['required', 'string', 'max:24'],
            'recipient_address' => ['required', 'string', 'max:200'],
            'recipient_zone' => ['nullable', 'string', 'max:60'],
            'recipient_city' => ['nullable', 'string', 'max:60'],
            'delivery_instructions' => ['nullable', 'string', 'max:500'],
            'payment_type' => ['required', 'in:cash_on_delivery,post_sale,prepaid'],
            'shipping_cost' => ['required', 'integer', 'min:0'],
            'cod_amount' => ['nullable', 'integer', 'min:0'],
            'driver_fee' => ['nullable', 'integer', 'min:0'],
            'is_outsourced' => ['nullable', 'boolean'],
            'outsource_company' => ['nullable', 'string', 'max:100'],
            'outsource_amount' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $shipment = $action->execute($validated, $request->user());

        return response()->json($shipment, 201);
    }

    /**
     * Actualizar datos del envío (no estado).
     */
    public function update(Request $request, Shipment $shipment): JsonResponse
    {
        $validated = $request->validate([
            'driver_id' => ['nullable', 'exists:drivers,id'],
            'recipient_name' => ['sometimes', 'string', 'max:100'],
            'recipient_phone' => ['sometimes', 'string', 'max:24'],
            'recipient_address' => ['sometimes', 'string', 'max:200'],
            'recipient_zone' => ['nullable', 'string', 'max:60'],
            'delivery_instructions' => ['nullable', 'string', 'max:500'],
            'shipping_cost' => ['sometimes', 'integer', 'min:0'],
            'cod_amount' => ['nullable', 'integer', 'min:0'],
            'driver_fee' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $shipment->update($validated);

        return response()->json($shipment->fresh(['client', 'driver']));
    }

    /**
     * Cambiar estado del envío (transición validada).
     */
    public function changeStatus(Request $request, Shipment $shipment, TransitionShipmentStatus $action): JsonResponse
    {
        $request->validate([
            'status' => ['required', 'string'],
            'description' => ['nullable', 'string', 'max:280'],
            'issue_note' => ['nullable', 'string', 'max:280'],
        ]);

        $newStatus = ShipmentStatus::from($request->status);

        // Si es novedad, guardar la nota
        if ($newStatus === ShipmentStatus::ISSUE && $request->issue_note) {
            $shipment->update(['issue_note' => $request->issue_note]);
        }

        $shipment = $action->execute(
            $shipment,
            $newStatus,
            $request->user(),
            $request->description,
        );

        return response()->json($shipment->load(['client', 'driver', 'events']));
    }

    /**
     * Asignar conductor a un envío.
     */
    public function assign(Request $request, Shipment $shipment): JsonResponse
    {
        $request->validate([
            'driver_id' => ['required', 'exists:drivers,id'],
        ]);

        $shipment->update(['driver_id' => $request->driver_id]);

        return response()->json($shipment->fresh(['client', 'driver']));
    }

    /**
     * Dashboard KPIs.
     */
    public function dashboard(Request $request): JsonResponse
    {
        $today = now()->toDateString();

        $todayQuery = Shipment::whereDate('created_at', $today);
        $total = (clone $todayQuery)->count();
        $byStatus = (clone $todayQuery)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        // Financiero rápido
        $codPending = Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'pending')
            ->sum('cod_amount');
        $codCollected = Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'collected')
            ->sum('cod_amount');
        $postSaleOwed = Shipment::where('payment_type', 'post_sale')
            ->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
            ->sum('shipping_cost');

        // Revenue hoy
        $todayRevenue = (clone $todayQuery)->sum('shipping_cost');
        $todayDriverCost = (clone $todayQuery)->sum('driver_fee');

        return response()->json([
            'today' => [
                'total' => $total,
                'registered' => $byStatus['registered'] ?? 0,
                'confirmed' => $byStatus['confirmed'] ?? 0,
                'in_transit' => $byStatus['in_transit'] ?? 0,
                'delivered' => $byStatus['delivered'] ?? 0,
                'issue' => $byStatus['issue'] ?? 0,
                'returned' => $byStatus['returned'] ?? 0,
                'cancelled' => $byStatus['cancelled'] ?? 0,
            ],
            'financial' => [
                'cod_pending' => (int) $codPending,
                'cod_collected' => (int) $codCollected,
                'post_sale_owed' => (int) $postSaleOwed,
                'today_revenue' => (int) $todayRevenue,
                'today_driver_cost' => (int) $todayDriverCost,
                'today_profit' => (int) ($todayRevenue - $todayDriverCost),
            ],
            'week' => [
                'total' => Shipment::where('created_at', '>=', now()->startOfWeek())->count(),
            ],
        ]);
    }
}
