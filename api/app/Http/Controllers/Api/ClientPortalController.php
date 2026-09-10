<?php

namespace App\Http\Controllers\Api;

use App\Domain\Client\Models\Client;
use App\Domain\Financial\Models\ClientCodEntitlement;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Enums\PickupWindow;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use App\Integrations\WhatsApp\Services\PickupFlowSubmissionProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClientPortalController extends Controller
{
    /**
     * Los doce estados internos traducidos al recorrido que el cliente
     * entiende. "Necesitamos tus datos" va aparte a propósito: es el único
     * peldaño donde la pelota está del lado del cliente, y esconderlo dentro
     * de "recibida" dejaría su recogida detenida sin que él sepa por qué.
     */
    private const PICKUP_LANES = [
        'draft' => 'recibida', 'pending_review' => 'recibida',
        'needs_customer_input' => 'necesitamos tus datos',
        'submitted' => 'recibida', 'accepted' => 'aprobada', 'ready_for_assignment' => 'programada',
        'assigned' => 'programada', 'driver_on_the_way' => 'en camino', 'partially_picked_up' => 'recogida parcial',
        'picked_up' => 'recogida', 'not_picked_up' => 'no recogida', 'cancelled' => 'cancelada',
    ];

    /** Resultado de recepción de cada paquete, en lenguaje de cliente. */
    private const RECEPTION_RESULTS = [
        'received' => 'Recibido',
        'rejected' => 'Rechazado',
        'missing' => 'No estaba',
        'undeclared' => 'Recibido sin declarar',
        'pending' => 'Pendiente',
    ];

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
        $codEntitlements = ClientCodEntitlement::query()->where('client_id', $clientId)->get();

        return response()->json([
            'total_shipments' => $totalShipments,
            'total_revenue' => $totalRevenue,
            'total_owed' => $totalOwed,
            'cod_collected' => $codCollected,
            'cod_reported' => (int) $codEntitlements->sum('reported_amount'),
            'cod_available' => (int) $codEntitlements->sum('available_amount'),
            'cod_transferred' => (int) $codEntitlements->sum('transferred_amount'),
            'cod_pending_transfer' => (int) $codEntitlements->sum(fn (ClientCodEntitlement $row) => $row->outstanding()),
        ]);
    }

    public function profile(Request $request): JsonResponse
    {
        $clientId = $this->requireClientId($request);
        $client = Client::with('addresses')->findOrFail($clientId);

        return response()->json($client);
    }

    public function pickups(Request $request): JsonResponse
    {
        $clientId = $this->requireClientId($request);
        $perPage = (int) $request->input('per_page', 20);
        $items = PickupRequest::query()->where('customer_id', $clientId)->withCount('packages')->latest()->paginate($perPage);
        $items->getCollection()->transform(fn (PickupRequest $pickup) => $this->pickupPayload($pickup));

        return response()->json($items);
    }

    public function pickupDetail(Request $request, PickupRequest $pickupRequest): JsonResponse
    {
        $clientId = $this->requireClientId($request);
        abort_unless((int) $pickupRequest->customer_id === $clientId, 403, 'No autorizado.');
        $pickupRequest->load(['packages', 'batches.items']);

        return response()->json(['pickup' => $this->pickupPayload($pickupRequest, true)]);
    }

    public function cancelPickup(Request $request, PickupRequest $pickupRequest, PickupRequestController $controller, PickupFlowSubmissionProcessor $processor): JsonResponse
    {
        $clientId = $this->requireClientId($request);
        abort_unless((int) $pickupRequest->customer_id === $clientId, 403, 'No autorizado.');
        if (in_array($pickupRequest->status, [PickupStatus::ASSIGNED, PickupStatus::DRIVER_ON_THE_WAY, PickupStatus::PICKED_UP, PickupStatus::PARTIALLY_PICKED_UP, PickupStatus::NOT_PICKED_UP, PickupStatus::CANCELLED], true)) {
            return response()->json(['message' => 'La solicitud ya está asignada o en curso y no se puede cancelar.'], 422);
        }

        // El motivo es un campo interno de la operación; el cliente no tiene
        // por qué conocer su catálogo. Se sella aquí quién canceló, y sus
        // palabras (si escribió alguna) viajan como nota.
        $request->merge([
            'reason_code' => 'CLIENT_SELF_SERVICE',
            'notes' => $request->input('notes') ?: 'Cancelada por el cliente desde su portal.',
        ]);

        return $controller->cancel($request, $pickupRequest, $processor);
    }

    /** Las jornadas en las que el cliente puede pedir que pasemos. */
    public function pickupWindows(Request $request): JsonResponse
    {
        $this->requireClientId($request);

        return response()->json(['windows' => PickupWindow::catalogoParaPortal()]);
    }

    private function pickupPayload(PickupRequest $pickup, bool $detail = false): array
    {
        $data = ['id' => $pickup->id, 'pickup_code' => $pickup->pickup_code, 'intake_mode' => $pickup->intake_mode?->value, 'created_at' => $pickup->created_at?->toIso8601String(), 'package_count' => $pickup->package_count, 'pickup_address' => $pickup->pickup_address_line1, 'pickup_city' => $pickup->pickup_city, 'service_location_id' => $pickup->service_location_id, 'status' => $pickup->status?->value, 'status_label' => self::PICKUP_LANES[$pickup->status?->value] ?? 'recibida'];
        if ($detail) {
            // El resultado de recepción vive en el renglón del lote, indexado
            // por paquete declarado. Un paquete sin renglón todavía no se ha
            // recibido; uno recibido "sin declarar" no aparece aquí porque no
            // nació de la declaración del cliente.
            $results = $pickup->batches
                ->flatMap(fn ($batch) => $batch->items)
                ->filter(fn ($item) => $item->pickup_package_id !== null)
                ->keyBy('pickup_package_id');

            $data['packages'] = $pickup->packages->map(function ($package) use ($results) {
                $item = $results->get($package->id);

                return [
                    'id' => $package->id,
                    'package_index' => $package->package_index,
                    'recipient_name' => $package->recipient_name,
                    'delivery_address' => $package->delivery_address_line1,
                    'delivery_city' => $package->delivery_city,
                    'payment_type' => $package->payment_type,
                    'guide_number' => $package->guide_number,
                    'reception_result' => $item?->result,
                    'reception_result_label' => self::RECEPTION_RESULTS[$item?->result] ?? null,
                ];
            })->values();

            // Lo que llegó sin estar declarado también es parte de la verdad
            // que el cliente debe poder ver, contado aparte.
            $data['undeclared_received'] = (int) $pickup->batches->sum('undeclared_packages');
        }

        return $data;
    }
}
