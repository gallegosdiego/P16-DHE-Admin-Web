<?php

namespace App\Http\Controllers\Api;

use App\Domain\Client\Models\Client;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClientPortalController extends Controller
{
    private function requireClientId(Request $request): int
    {
        $clientId = (int) ($request->user()?->client_id ?? 0);
        abort_unless($clientId > 0, 403, 'No eres un cliente.');

        return $clientId;
    }

    public function dashboard(Request $request): JsonResponse
    {
        $clientId = $this->requireClientId($request);

        $total = Shipment::where('client_id', $clientId)->count();
        $inTransit = Shipment::where('client_id', $clientId)
            ->whereIn('status', ['in_transit', 'assigned_to_route'])
            ->count();
        $deliveredToday = Shipment::where('client_id', $clientId)
            ->where('status', 'delivered')
            ->whereDate('delivered_at', now()->toDateString())
            ->count();
        $pendingPayment = Shipment::where('client_id', $clientId)
            ->where('payment_type', 'post_sale')
            ->whereIn('financial_status', ['pending', 'invoiced'])
            ->sum('shipping_cost');

        return response()->json([
            'total_shipments' => $total,
            'in_transit' => $inTransit,
            'delivered_today' => $deliveredToday,
            'pending_payment' => (int) $pendingPayment,
        ]);
    }

    public function shipments(Request $request): JsonResponse
    {
        $clientId = $this->requireClientId($request);
        $filters = $request->validate([
            'status' => ['nullable', 'string'],
            'search' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Shipment::where('client_id', $clientId)
            ->with(['driver:id,name,initials,phone']);

        if ($status = ($filters['status'] ?? null)) {
            $query->where('status', $status);
        }
        if ($search = ($filters['search'] ?? null)) {
            $query->where(function ($q) use ($search) {
                $q->where('display_code', 'like', "%{$search}%")
                    ->orWhere('recipient_name', 'like', "%{$search}%")
                    ->orWhere('tracking_code', 'like', "%{$search}%");
            });
        }

        $perPage = (int) ($filters['per_page'] ?? 20);

        return response()->json($query->orderByDesc('created_at')->paginate($perPage));
    }

    public function shipmentDetail(Request $request, Shipment $shipment): JsonResponse
    {
        $clientId = $this->requireClientId($request);
        abort_unless((int) $shipment->client_id === $clientId, 403, 'No autorizado.');

        $shipment->load([
            'driver:id,name,phone',
            'events' => fn ($q) => $q->select('id', 'shipment_id', 'to_status', 'description', 'occurred_at')
                ->orderBy('occurred_at'),
        ]);

        return response()->json([
            'shipment' => [
                'id' => $shipment->id,
                'tracking_code' => $shipment->tracking_code,
                'display_code' => $shipment->display_code,
                'status' => $shipment->status->value,
                'status_label' => $shipment->status->label(),
                'recipient_name' => $shipment->recipient_name,
                'recipient_phone' => $shipment->recipient_phone,
                'recipient_address' => $shipment->recipient_address,
                'recipient_zone' => $shipment->recipient_zone,
                'recipient_city' => $shipment->recipient_city,
                'payment_type' => $shipment->payment_type->value,
                'shipping_cost' => $shipment->shipping_cost,
                'cod_amount' => $shipment->cod_amount,
                'delivered_at' => $shipment->delivered_at?->toIso8601String(),
                'created_at' => $shipment->created_at->toIso8601String(),
                'driver' => $shipment->driver ? [
                    'name' => $shipment->driver->name,
                    'phone' => $shipment->driver->phone,
                ] : null,
            ],
            'timeline' => $shipment->events->map(fn ($event) => [
                'status' => $event->to_status,
                'description' => $event->description,
                'timestamp' => $event->occurred_at->toIso8601String(),
            ]),
        ]);
    }

    public function financial(Request $request): JsonResponse
    {
        $clientId = $this->requireClientId($request);

        $totalShipments = Shipment::where('client_id', $clientId)->count();
        $totalRevenue = (int) Shipment::where('client_id', $clientId)->sum('shipping_cost');
        $totalOwed = (int) Shipment::where('client_id', $clientId)
            ->where('payment_type', 'post_sale')
            ->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
            ->sum('shipping_cost');
        $codCollected = (int) Shipment::where('client_id', $clientId)
            ->where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'collected')
            ->sum('cod_amount');

        return response()->json([
            'total_shipments' => $totalShipments,
            'total_revenue' => $totalRevenue,
            'total_owed' => $totalOwed,
            'cod_collected' => $codCollected,
        ]);
    }

    public function profile(Request $request): JsonResponse
    {
        $clientId = $this->requireClientId($request);
        $client = Client::with('addresses')->findOrFail($clientId);

        return response()->json($client);
    }
}
