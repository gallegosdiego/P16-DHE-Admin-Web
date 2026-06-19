<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Actions\CreateShipment;
use App\Domain\Shipment\Actions\TransitionShipmentStatus;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ShipmentController extends Controller
{
    /**
     * Lista de envÃ­os con filtros y paginaciÃ³n.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'string'],
            'driver_id' => ['nullable', 'integer'],
            'client_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:120'],
            'financial_status' => ['nullable', 'string'],
            'payment_type' => ['nullable', 'string'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Shipment::with(['client:id,name,phone', 'driver:id,name,initials,phone']);

        // Filtros
        if ($status = ($filters['status'] ?? null)) {
            $query->where('status', $status);
        }
        if ($driver = ($filters['driver_id'] ?? null)) {
            $query->where('driver_id', $driver);
        }
        if ($client = ($filters['client_id'] ?? null)) {
            $query->where('client_id', $client);
        }
        if ($search = ($filters['search'] ?? null)) {
            $query->where(function ($q) use ($search) {
                $q->where('display_code', 'like', "%{$search}%")
                  ->orWhere('tracking_code', 'like', "%{$search}%")
                  ->orWhere('recipient_name', 'like', "%{$search}%")
                  ->orWhere('recipient_phone', 'like', "%{$search}%")
                  ->orWhere('recipient_address', 'like', "%{$search}%")
                  ->orWhereHas('client', fn ($q) => $q->where('name', 'like', "%{$search}%"));
            });
        }
        if ($financialStatus = ($filters['financial_status'] ?? null)) {
            $query->where('financial_status', $financialStatus);
        }
        if ($paymentType = ($filters['payment_type'] ?? null)) {
            $query->where('payment_type', $paymentType);
        }
        if ($dateFrom = ($filters['date_from'] ?? null)) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }
        if ($dateTo = ($filters['date_to'] ?? null)) {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        $shipments = $query->orderByDesc('created_at')
            ->paginate((int) ($filters['per_page'] ?? 25));

        return response()->json($shipments);
    }

    /**
     * Detalle de un envÃ­o con timeline.
     */
    public function show(Shipment $shipment): JsonResponse
    {
        $shipment->load(['client', 'driver', 'events.user:id,name', 'createdBy:id,name']);

        return response()->json($shipment);
    }

    /**
     * Crear nuevo envÃ­o.
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
            'payment_type' => ['required', 'in:cash_on_delivery,post_sale,prepaid,mercado_libre'],
            'shipping_cost' => ['required', 'integer', 'min:0'],
            'cod_amount' => ['nullable', 'integer', 'min:0'],
            'driver_fee' => ['nullable', 'integer', 'min:0'],
            'is_outsourced' => ['nullable', 'boolean'],
            'outsource_company' => ['nullable', 'string', 'max:100'],
            'outsource_amount' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
            'intake_photo' => ['nullable', 'image', 'mimes:jpeg,png,jpg,webp', 'max:5120'],
        ]);

        $shipment = $action->execute(
            collect($validated)->except('intake_photo')->toArray(),
            $request->user()
        );

        if ($request->hasFile('intake_photo')) {
            $path = $request->file('intake_photo')->store('public/intake');
            $shipment->update(['intake_photo' => Storage::url($path)]);
        }

        return response()->json($shipment, 201);
    }

    /**
     * Actualizar datos del envÃ­o (no estado).
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
            'payment_type' => ['sometimes', 'in:cash_on_delivery,post_sale,prepaid,mercado_libre'],
            'shipping_cost' => ['sometimes', 'integer', 'min:0'],
            'cod_amount' => ['nullable', 'integer', 'min:0'],
            'driver_fee' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
            'intake_photo' => ['nullable', 'image', 'mimes:jpeg,png,jpg,webp', 'max:5120'],
        ]);

        $shipment->update(collect($validated)->except('intake_photo')->toArray());

        if ($request->hasFile('intake_photo')) {
            $path = $request->file('intake_photo')->store('public/intake');
            $shipment->update(['intake_photo' => Storage::url($path)]);
        }

        return response()->json($shipment->fresh(['client', 'driver']));
    }

    /**
     * Eliminar envío (soft delete).
     *
     * DELETE /api/shipments/{shipment}
     */
    public function destroy(Shipment $shipment): JsonResponse
    {
        $blocked = ['delivered', 'in_transit'];
        if (in_array($shipment->getRawOriginal('status'), $blocked)) {
            return response()->json([
                'message' => 'No se puede eliminar un envío en estado ' . $shipment->status->label(),
            ], 422);
        }

        $shipment->delete();

        return response()->json(['message' => 'Envío eliminado correctamente']);
    }

    /**
     * Cambiar estado del envío (transición validada).
     */
    public function changeStatus(Request $request, Shipment $shipment, TransitionShipmentStatus $action): JsonResponse
    {
        $rules = [
            'status' => ['required', 'string'],
            'description' => ['nullable', 'string', 'max:280'],
            'issue_note' => ['nullable', 'string', 'max:280'],
            'evidence_receiver_name' => ['nullable', 'string', 'max:100'],
        ];

        // Validar foto de evidencia solo si viene en el request
        if ($request->hasFile('evidence_photo')) {
            $rules['evidence_photo'] = ['image', 'mimes:jpeg,png,jpg', 'max:5120'];
        }

        $request->validate($rules);

        $newStatus = ShipmentStatus::tryFrom($request->status);

        if (! $newStatus) {
            return response()->json(['message' => 'Estado inválido.'], 422);
        }

        // Si es novedad, guardar la nota
        if ($newStatus === ShipmentStatus::ISSUE && $request->issue_note) {
            $shipment->update(['issue_note' => $request->issue_note]);
        }

        // Guardar foto de evidencia si fue enviada
        if ($request->hasFile('evidence_photo')) {
            $filename = $shipment->id . '_' . now()->timestamp . '.jpg';
            $path = $request->file('evidence_photo')->storeAs('public/evidence', $filename);
            $shipment->evidence_photo = Storage::url($path);
        }

        // Guardar nombre del receptor si fue enviado
        if ($request->filled('evidence_receiver_name')) {
            $shipment->evidence_receiver_name = $request->evidence_receiver_name;
        }

        // Persistir campos de evidencia si fueron modificados
        if ($shipment->isDirty()) {
            $shipment->save();
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
     * Asignar conductor a un envÃ­o.
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
     * Cambiar estado de mÃºltiples envÃ­os (batch).
     */
    public function batchStatus(Request $request, TransitionShipmentStatus $action): JsonResponse
    {
        $request->validate([
            'shipment_ids' => ['required', 'array', 'min:1', 'max:50'],
            'shipment_ids.*' => ['integer', 'exists:shipments,id'],
            'status' => ['required', 'string'],
            'description' => ['nullable', 'string', 'max:280'],
        ]);

        $newStatus = ShipmentStatus::tryFrom($request->status);

        if (! $newStatus) {
            return response()->json(['message' => 'Estado inválido.'], 422);
        }
        $results = ['success' => 0, 'failed' => 0, 'errors' => []];

        foreach ($request->shipment_ids as $id) {
            try {
                $shipment = Shipment::findOrFail($id);
                $action->execute($shipment, $newStatus, $request->user(), $request->description);
                $results['success']++;
            } catch (\Exception $e) {
                $results['failed']++;
                $results['errors'][] = "#{$id}: {$e->getMessage()}";
            }
        }

        return response()->json([
            ...$results,
            'message' => "{$results['success']} envÃ­os actualizados.",
        ]);
    }

    /**
     * Asignar conductor a mÃºltiples envÃ­os (batch).
     */
    public function batchAssign(Request $request): JsonResponse
    {
        $request->validate([
            'shipment_ids' => ['required', 'array', 'min:1', 'max:50'],
            'shipment_ids.*' => ['integer', 'exists:shipments,id'],
            'driver_id' => ['required', 'exists:drivers,id'],
        ]);

        $count = Shipment::whereIn('id', $request->shipment_ids)
            ->update(['driver_id' => $request->driver_id]);

        return response()->json([
            'updated' => $count,
            'message' => "{$count} envÃ­os asignados.",
        ]);
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

        // Financiero rÃ¡pido
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

    /**
     * EstadÃ­sticas por hora del dÃ­a actual â€” para grÃ¡fica de dashboard.
     */
    public function hourlyStats(): JsonResponse
    {
        $today = now()->toDateString();
        $driver = DB::getDriverName();

        // Expresion de hora compatible con MySQL, PostgreSQL y SQLite.
        $hourExpr = match ($driver) {
            'mysql', 'mariadb' => "CAST(DATE_FORMAT(created_at, '%H') AS UNSIGNED)",
            'pgsql' => "EXTRACT(HOUR FROM created_at)::int",
            default => "CAST(strftime('%H', created_at) AS INTEGER)",
        };
        $hourExprDelivered = match ($driver) {
            'mysql', 'mariadb' => "CAST(DATE_FORMAT(delivered_at, '%H') AS UNSIGNED)",
            'pgsql' => "EXTRACT(HOUR FROM delivered_at)::int",
            default => "CAST(strftime('%H', delivered_at) AS INTEGER)",
        };

        $shipments = Shipment::whereDate('created_at', $today)
            ->selectRaw("{$hourExpr} as hour, count(*) as total")
            ->groupBy('hour')
            ->orderBy('hour')
            ->pluck('total', 'hour');
        $hours = [];
        for ($h = 6; $h <= 20; $h++) {
            $hours[] = [
                'hour' => sprintf('%d:00', $h),
                'label' => sprintf('%d %s', $h > 12 ? $h - 12 : $h, $h >= 12 ? 'PM' : 'AM'),
                'count' => $shipments[$h] ?? $shipments[str_pad($h, 2, '0', STR_PAD_LEFT)] ?? 0,
            ];
        }

        $deliveries = Shipment::whereDate('delivered_at', $today)
            ->selectRaw("{$hourExprDelivered} as hour, count(*) as total")
            ->groupBy('hour')
            ->orderBy('hour')
            ->pluck('total', 'hour');

        $deliveryHours = [];
        for ($h = 6; $h <= 20; $h++) {
            $deliveryHours[] = [
                'hour' => sprintf('%d:00', $h),
                'count' => $deliveries[$h] ?? $deliveries[str_pad($h, 2, '0', STR_PAD_LEFT)] ?? 0,
            ];
        }

        return response()->json([
            'registrations' => $hours,
            'deliveries' => $deliveryHours,
            'peak_hour' => collect($hours)->sortByDesc('count')->first(),
        ]);
    }
}
