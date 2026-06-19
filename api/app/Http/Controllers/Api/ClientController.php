<?php

namespace App\Http\Controllers\Api;

use App\Domain\Client\Models\Client;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClientController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'billing_type' => ['nullable', 'in:cash_on_delivery,post_sale,prepaid'],
            'active_only' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Client::withCount('shipments');

        if ($search = ($filters['search'] ?? null)) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%")
                  ->orWhere('company', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }
        if ($billingType = ($filters['billing_type'] ?? null)) {
            $query->where('billing_type', $billingType);
        }
        if (($filters['active_only'] ?? false) === true) {
            $query->where('is_active', true);
        }

        $clients = $query->orderBy('name')->paginate((int) ($filters['per_page'] ?? 25));

        return response()->json($clients);
    }

    public function show(Client $client): JsonResponse
    {
        $client->load(['addresses', 'shipments' => function ($q) {
            $q->latest()->limit(20);
        }]);

        // Agregar resumen financiero
        $client->setAttribute('financial_summary', [
            'total_shipments' => $client->shipments()->count(),
            'total_owed' => $client->totalOwed(),
            'total_revenue' => (int) $client->shipments()->sum('shipping_cost'),
        ]);

        return response()->json($client);
    }

    public function myDashboard(Request $request): JsonResponse
    {
        $scopedClientId = (int) ($request->attributes->get('_scoped_client_id') ?? 0);
        $requestedClientId = (int) ($request->input('client_id') ?? 0);
        $isAdmin = $request->user()?->hasAnyRole(['superadmin', 'admin', 'administrador']) ?? false;

        if ($scopedClientId > 0) {
            $clientId = $scopedClientId;
        } elseif ($isAdmin && $requestedClientId > 0) {
            $clientId = $requestedClientId;
        } elseif ($isAdmin) {
            $clientId = null;
        } else {
            return response()->json(['error' => 'Acceso denegado'], 403);
        }

        $activeStatuses = ['registered', 'confirmed', 'pickup_scheduled', 'picked_up', 'in_warehouse', 'assigned_to_route', 'in_transit', 'issue'];

        $activeShipmentsQuery = Shipment::query()
            ->whereIn('status', $activeStatuses);
        $deliveredThisMonthQuery = Shipment::query()
            ->where('status', 'delivered')
            ->whereMonth('updated_at', now()->month)
            ->whereYear('updated_at', now()->year);
        $pendingBalanceQuery = Shipment::query()
            ->where('payment_type', 'post_sale')
            ->where('financial_status', '!=', 'settled');
        $recentShipmentsQuery = Shipment::query()->orderByDesc('created_at');

        if ($clientId !== null) {
            $activeShipmentsQuery->where('client_id', $clientId);
            $deliveredThisMonthQuery->where('client_id', $clientId);
            $pendingBalanceQuery->where('client_id', $clientId);
            $recentShipmentsQuery->where('client_id', $clientId);
        }

        $client = $clientId !== null
            ? Client::findOrFail($clientId)->only(['id', 'name', 'company', 'phone'])
            : null;

        return response()->json([
            'client' => $client,
            'active_shipments' => $activeShipmentsQuery->count(),
            'delivered_this_month' => $deliveredThisMonthQuery->count(),
            'pending_balance' => (int) $pendingBalanceQuery->sum('shipping_cost'),
            'recent_shipments' => $recentShipmentsQuery->limit(5)
                ->get(['id', 'client_id', 'display_code', 'status', 'recipient_name', 'created_at']),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:24'],
            'email' => ['nullable', 'email', 'max:120'],
            'company' => ['nullable', 'string', 'max:100'],
            'nit' => ['nullable', 'string', 'max:20'],
            'billing_type' => ['required', 'in:cash_on_delivery,post_sale,prepaid'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $client = Client::create($validated);

        return response()->json($client, 201);
    }

    public function update(Request $request, Client $client): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:24'],
            'email' => ['nullable', 'email', 'max:120'],
            'company' => ['nullable', 'string', 'max:100'],
            'nit' => ['nullable', 'string', 'max:20'],
            'billing_type' => ['sometimes', 'in:cash_on_delivery,post_sale,prepaid'],
            'notes' => ['nullable', 'string', 'max:500'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $client->update($validated);

        return response()->json($client->fresh());
    }

    /**
     * Cuentas por cobrar — "¿Quién me debe?"
     */
    public function accountsReceivable(): JsonResponse
    {
        $clients = Client::where('billing_type', 'post_sale')
            ->where('is_active', true)
            ->with(['shipments' => function ($q) {
                $q->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
                  ->select('id', 'client_id', 'shipping_cost', 'financial_status', 'created_at');
            }])
            ->get()
            ->map(function ($client) {
                $unpaidShipments = $client->shipments;
                $totalOwed = $unpaidShipments->sum('shipping_cost');
                $oldest = $unpaidShipments->sortBy('created_at')->first();

                return [
                    'id' => $client->id,
                    'name' => $client->name,
                    'phone' => $client->phone,
                    'company' => $client->company,
                    'total_owed' => (int) $totalOwed,
                    'owed_shipments_count' => $unpaidShipments->count(),
                    'days_oldest_debt' => $oldest ? (int) now()->diffInDays($oldest->created_at) : 0,
                ];
            })
            ->filter(fn ($c) => $c['total_owed'] > 0)
            ->sortByDesc('total_owed')
            ->values();

        return response()->json([
            'clients' => $clients,
            'total_owed' => (int) $clients->sum('total_owed'),
            'count' => $clients->count(),
        ]);
    }

    /**
     * Agregar dirección a un cliente.
     */
    public function storeAddress(Request $request, Client $client): JsonResponse
    {
        $validated = $request->validate([
            'address' => ['required', 'string', 'max:200'],
            'zone' => ['nullable', 'string', 'max:60'],
            'label' => ['nullable', 'string', 'max:60'],
        ]);

        $address = $client->addresses()->create($validated);

        return response()->json($address, 201);
    }

    /**
     * Actualizar dirección.
     */
    public function updateAddress(Request $request, int $addressId): JsonResponse
    {
        $address = \App\Domain\Client\Models\ClientAddress::findOrFail($addressId);

        $validated = $request->validate([
            'address' => ['sometimes', 'string', 'max:200'],
            'zone' => ['nullable', 'string', 'max:60'],
            'label' => ['nullable', 'string', 'max:60'],
        ]);

        $address->update($validated);

        return response()->json($address->fresh());
    }

    /**
     * Eliminar dirección.
     */
    public function deleteAddress(int $addressId): JsonResponse
    {
        $address = \App\Domain\Client\Models\ClientAddress::findOrFail($addressId);
        $address->delete();

        return response()->json(['message' => 'Dirección eliminada.']);
    }

    /**
     * Liquidar cuentas por cobrar de un cliente.
     */
    public function settleReceivables(Client $client): JsonResponse
    {
        $shipments = $client->shipments()
            ->where('payment_type', 'post_sale')
            ->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
            ->get();

        $totalSettled = 0;
        foreach ($shipments as $shipment) {
            $shipment->update([
                'financial_status' => 'settled',
            ]);
            $totalSettled += $shipment->shipping_cost;
        }

        // Registrar log de auditoría
        \App\Domain\Shared\Models\AuditLog::log(
            action: 'financial.client_settled',
            entity: $client,
            description: "Cuentas por cobrar del cliente {$client->name} liquidadas. Total: {$totalSettled}."
        );

        return response()->json([
            'message' => 'Cuentas por cobrar liquidadas con éxito.',
            'settled_amount' => $totalSettled,
            'shipments_count' => $shipments->count(),
        ]);
    }
}
