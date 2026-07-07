<?php

namespace App\Http\Controllers\Api;

use App\Domain\Client\Models\Client;
use App\Domain\Client\Models\ClientAddress;
use App\Domain\Pickup\Enums\CustomerWhatsAppStatus;
use App\Domain\Pickup\Models\CustomerWhatsAppSetting;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use App\Integrations\WhatsApp\Enums\CustomerWhatsAppContactStatus;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContact;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContactPermission;
use App\Integrations\WhatsApp\Models\WhatsAppContact;
use App\Domain\Shared\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ClientController extends Controller
{
    /**
     * @var list<string>
     */
    private const ALLOWED_WHATSAPP_PERMISSIONS = [
        'CREATE_PICKUP',
        'VIEW_OWN_PICKUPS',
        'USE_SAVED_ADDRESSES',
        'CREATE_COD_SHIPMENT',
        'CANCEL_UNASSIGNED_PICKUP',
    ];

    /**
     * @var list<string>
     */
    private const DEFAULT_WHATSAPP_PERMISSIONS = [
        'CREATE_PICKUP',
        'VIEW_OWN_PICKUPS',
        'USE_SAVED_ADDRESSES',
    ];

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

    public function whatsappSettings(Client $client): JsonResponse
    {
        $client->load([
            'whatsappSettings.defaultPickupAddress',
            'whatsappContacts.whatsappContact',
            'whatsappContacts.permissions',
        ]);

        return response()->json($this->whatsappSettingsPayload($client));
    }

    public function updateWhatsAppSettings(Request $request, Client $client): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'in:DISABLED,PENDING_CONFIGURATION,ACTIVE,SUSPENDED'],
            'cod_enabled' => ['required', 'boolean'],
            'automatic_package_limit' => ['required', 'integer', 'min:1', 'max:999'],
            'manual_review_package_limit' => ['required', 'integer', 'min:1', 'max:999'],
            'automatic_cod_limit' => ['required', 'integer', 'min:0', 'max:999999999'],
            'manual_review_cod_limit' => ['required', 'integer', 'min:0', 'max:999999999'],
            'automatic_cod_total_limit' => ['required', 'integer', 'min:0', 'max:999999999'],
            'allowed_windows' => ['nullable', 'array'],
            'allowed_windows.*' => ['string', 'max:40'],
            'default_pickup_address_id' => ['nullable', 'integer', 'exists:client_addresses,id'],
            'suspension_reason' => ['nullable', 'string', 'max:120'],
        ]);

        if (($validated['manual_review_package_limit'] ?? 0) < ($validated['automatic_package_limit'] ?? 0)) {
            return response()->json([
                'message' => 'El límite de revisión manual no puede ser menor que el límite automático de paquetes.',
            ], 422);
        }

        if (($validated['manual_review_cod_limit'] ?? 0) < ($validated['automatic_cod_limit'] ?? 0)) {
            return response()->json([
                'message' => 'El límite de revisión manual COD no puede ser menor que el límite automático COD.',
            ], 422);
        }

        $defaultAddressId = $validated['default_pickup_address_id'] ?? null;

        if ($defaultAddressId !== null && ! $client->addresses()->whereKey($defaultAddressId)->exists()) {
            return response()->json([
                'message' => 'La dirección por defecto no pertenece a este cliente.',
            ], 422);
        }

        $settings = $client->whatsappSettings ?: new CustomerWhatsAppSetting(['customer_id' => $client->id]);
        $previous = $settings->exists ? $settings->toArray() : null;
        $status = CustomerWhatsAppStatus::from($validated['status']);

        $settings->fill([
            'status' => $status->value,
            'cod_enabled' => $validated['cod_enabled'],
            'automatic_package_limit' => $validated['automatic_package_limit'],
            'manual_review_package_limit' => $validated['manual_review_package_limit'],
            'automatic_cod_limit' => $validated['automatic_cod_limit'],
            'manual_review_cod_limit' => $validated['manual_review_cod_limit'],
            'automatic_cod_total_limit' => $validated['automatic_cod_total_limit'],
            'allowed_windows_json' => array_values(array_unique($validated['allowed_windows'] ?? [])),
            'default_pickup_address_id' => $defaultAddressId,
            'suspension_reason' => $validated['suspension_reason'] ?? null,
            'activated_at' => $status === CustomerWhatsAppStatus::ACTIVE ? ($settings->activated_at ?? now()) : $settings->activated_at,
            'activated_by' => $status === CustomerWhatsAppStatus::ACTIVE ? ($settings->activated_by ?? $request->user()?->id) : $settings->activated_by,
            'suspended_at' => $status === CustomerWhatsAppStatus::SUSPENDED ? now() : null,
            'suspended_by' => $status === CustomerWhatsAppStatus::SUSPENDED ? $request->user()?->id : null,
        ]);
        $settings->save();

        AuditLog::log(
            action: 'clients.whatsapp_settings_updated',
            entity: $client,
            oldValues: $previous,
            newValues: $settings->fresh()?->toArray(),
            description: "Configuración WhatsApp actualizada para cliente {$client->name}."
        );

        $client->load([
            'whatsappSettings.defaultPickupAddress',
            'whatsappContacts.whatsappContact',
            'whatsappContacts.permissions',
        ]);

        return response()->json($this->whatsappSettingsPayload($client));
    }

    public function storeWhatsAppContact(Request $request, Client $client): JsonResponse
    {
        $validated = $request->validate([
            'wa_id' => ['nullable', 'string', 'max:64', 'required_without:phone'],
            'phone' => ['nullable', 'string', 'max:24', 'required_without:wa_id'],
            'display_name' => ['nullable', 'string', 'max:120'],
            'role' => ['nullable', 'string', 'max:60'],
            'status' => ['nullable', 'in:AUTHORIZED,SUSPENDED,REVOKED'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', 'in:'.implode(',', self::ALLOWED_WHATSAPP_PERMISSIONS)],
        ]);

        $link = DB::transaction(function () use ($validated, $request, $client) {
            $normalizedWaId = $this->normalizedWaId($validated['wa_id'] ?? null, $validated['phone'] ?? null);
            $normalizedPhone = $this->normalizedPhone($validated['phone'] ?? $normalizedWaId);

            $contact = WhatsAppContact::query()->firstOrNew(['wa_id' => $normalizedWaId]);
            $contact->fill([
                'phone' => $normalizedPhone,
                'display_name' => $validated['display_name'] ?? $contact->display_name,
                'verification_status' => $contact->exists ? $contact->verification_status->value : 'KNOWN',
            ]);
            $contact->save();

            $link = CustomerWhatsAppContact::query()->firstOrNew([
                'customer_id' => $client->id,
                'whatsapp_contact_id' => $contact->id,
            ]);

            $targetStatus = CustomerWhatsAppContactStatus::from($validated['status'] ?? CustomerWhatsAppContactStatus::AUTHORIZED->value);

            $link->fill([
                'role' => $validated['role'] ?? $link->role,
                'status' => $targetStatus->value,
                'authorized_at' => $targetStatus === CustomerWhatsAppContactStatus::AUTHORIZED ? ($link->authorized_at ?? now()) : $link->authorized_at,
                'authorized_by' => $targetStatus === CustomerWhatsAppContactStatus::AUTHORIZED ? ($link->authorized_by ?? $request->user()?->id) : $link->authorized_by,
                'revoked_at' => in_array($targetStatus, [CustomerWhatsAppContactStatus::SUSPENDED, CustomerWhatsAppContactStatus::REVOKED], true) ? now() : null,
                'revoked_by' => in_array($targetStatus, [CustomerWhatsAppContactStatus::SUSPENDED, CustomerWhatsAppContactStatus::REVOKED], true) ? $request->user()?->id : null,
            ]);
            $link->save();

            $this->syncContactPermissions(
                $link,
                $validated['permissions'] ?? self::DEFAULT_WHATSAPP_PERMISSIONS,
            );

            AuditLog::log(
                action: 'clients.whatsapp_contact_created',
                entity: $client,
                newValues: $link->fresh(['whatsappContact', 'permissions'])?->toArray(),
                description: "Contacto WhatsApp autorizado para cliente {$client->name}."
            );

            return $link;
        });

        return response()->json($this->whatsappContactPayload(
            $link->fresh(['whatsappContact', 'permissions'])->loadMissing('customer')
        ), 201);
    }

    public function updateWhatsAppContact(Request $request, Client $client, CustomerWhatsAppContact $contact): JsonResponse
    {
        $this->ensureClientOwnsWhatsAppContact($client, $contact);

        $validated = $request->validate([
            'display_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:24'],
            'role' => ['nullable', 'string', 'max:60'],
            'status' => ['nullable', 'in:PENDING,AUTHORIZED,SUSPENDED,REVOKED'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', 'in:'.implode(',', self::ALLOWED_WHATSAPP_PERMISSIONS)],
        ]);

        DB::transaction(function () use ($validated, $request, $contact) {
            if (array_key_exists('display_name', $validated) || array_key_exists('phone', $validated)) {
                $contact->whatsappContact->fill([
                    'display_name' => $validated['display_name'] ?? $contact->whatsappContact->display_name,
                    'phone' => array_key_exists('phone', $validated)
                        ? $this->normalizedPhone($validated['phone'])
                        : $contact->whatsappContact->phone,
                ])->save();
            }

            if (array_key_exists('role', $validated)) {
                $contact->role = $validated['role'];
            }

            if (array_key_exists('status', $validated)) {
                $status = CustomerWhatsAppContactStatus::from($validated['status']);
                $contact->status = $status->value;
                if ($status === CustomerWhatsAppContactStatus::AUTHORIZED) {
                    $contact->authorized_at = $contact->authorized_at ?? now();
                    $contact->authorized_by = $contact->authorized_by ?? $request->user()?->id;
                    $contact->revoked_at = null;
                    $contact->revoked_by = null;
                }
                if (in_array($status, [CustomerWhatsAppContactStatus::SUSPENDED, CustomerWhatsAppContactStatus::REVOKED], true)) {
                    $contact->revoked_at = now();
                    $contact->revoked_by = $request->user()?->id;
                }
            }

            $contact->save();

            if (array_key_exists('permissions', $validated)) {
                $this->syncContactPermissions($contact, $validated['permissions'] ?? []);
            }
        });

        return response()->json($this->whatsappContactPayload(
            $contact->fresh(['whatsappContact', 'permissions', 'customer'])
        ));
    }

    public function suspendWhatsAppContact(Request $request, Client $client, CustomerWhatsAppContact $contact): JsonResponse
    {
        $this->ensureClientOwnsWhatsAppContact($client, $contact);

        $contact->forceFill([
            'status' => CustomerWhatsAppContactStatus::SUSPENDED->value,
            'revoked_at' => now(),
            'revoked_by' => $request->user()?->id,
        ])->save();

        AuditLog::log(
            action: 'clients.whatsapp_contact_suspended',
            entity: $client,
            newValues: $contact->fresh(['whatsappContact', 'permissions'])?->toArray(),
            description: "Contacto WhatsApp suspendido para cliente {$client->name}."
        );

        return response()->json([
            'message' => 'Contacto WhatsApp suspendido.',
            'contact' => $this->whatsappContactPayload(
                $contact->fresh(['whatsappContact', 'permissions', 'customer'])
            ),
        ]);
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

    private function ensureClientOwnsWhatsAppContact(Client $client, CustomerWhatsAppContact $contact): void
    {
        abort_if($contact->customer_id !== $client->id, 404);
    }

    /**
     * @param list<string> $permissions
     */
    private function syncContactPermissions(CustomerWhatsAppContact $contact, array $permissions): void
    {
        $permissions = array_values(array_unique($permissions));

        $contact->permissions()->delete();

        foreach ($permissions as $permission) {
            CustomerWhatsAppContactPermission::query()->create([
                'customer_whatsapp_contact_id' => $contact->id,
                'permission' => $permission,
                'created_at' => now(),
            ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function whatsappSettingsPayload(Client $client): array
    {
        $settings = $client->whatsappSettings ?: new CustomerWhatsAppSetting([
            'customer_id' => $client->id,
            'status' => CustomerWhatsAppStatus::DISABLED->value,
            'cod_enabled' => false,
            'automatic_package_limit' => 5,
            'manual_review_package_limit' => 20,
            'automatic_cod_limit' => 500000,
            'manual_review_cod_limit' => 1000000,
            'automatic_cod_total_limit' => 2000000,
            'allowed_windows_json' => ['today_am', 'today_pm'],
        ]);

        return [
            'customer_id' => $client->id,
            'status' => $settings->status->value,
            'cod_enabled' => (bool) $settings->cod_enabled,
            'automatic_package_limit' => (int) $settings->automatic_package_limit,
            'manual_review_package_limit' => (int) $settings->manual_review_package_limit,
            'automatic_cod_limit' => (int) $settings->automatic_cod_limit,
            'manual_review_cod_limit' => (int) $settings->manual_review_cod_limit,
            'automatic_cod_total_limit' => (int) $settings->automatic_cod_total_limit,
            'allowed_windows' => array_values($settings->allowed_windows_json ?? []),
            'default_pickup_address_id' => $settings->default_pickup_address_id,
            'default_pickup_address' => $settings->defaultPickupAddress ? [
                'id' => $settings->defaultPickupAddress->id,
                'label' => $settings->defaultPickupAddress->label,
                'address' => $settings->defaultPickupAddress->address,
                'zone' => $settings->defaultPickupAddress->zone,
                'city' => $settings->defaultPickupAddress->city,
            ] : null,
            'contacts' => $client->whatsappContacts
                ->sortBy(fn (CustomerWhatsAppContact $contact) => $contact->whatsappContact?->display_name ?? $contact->whatsappContact?->phone ?? '')
                ->values()
                ->map(fn (CustomerWhatsAppContact $contact) => $this->whatsappContactPayload($contact))
                ->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function whatsappContactPayload(CustomerWhatsAppContact $contact): array
    {
        $whatsappContact = $contact->whatsappContact;

        return [
            'id' => $contact->id,
            'customer_id' => $contact->customer_id,
            'wa_id' => $whatsappContact?->wa_id,
            'phone' => $whatsappContact?->phone,
            'display_name' => $whatsappContact?->display_name,
            'role' => $contact->role,
            'status' => $contact->status->value,
            'authorized_at' => $contact->authorized_at?->toISOString(),
            'authorized_by' => $contact->authorized_by,
            'revoked_at' => $contact->revoked_at?->toISOString(),
            'revoked_by' => $contact->revoked_by,
            'permissions' => $contact->permissions
                ->pluck('permission')
                ->values()
                ->all(),
        ];
    }

    private function normalizedPhone(?string $value): string
    {
        return preg_replace('/\D+/', '', (string) ($value ?? '')) ?: '';
    }

    private function normalizedWaId(?string $waId, ?string $phone): string
    {
        $normalizedWaId = $this->normalizedPhone($waId);

        if ($normalizedWaId !== '') {
            return $normalizedWaId;
        }

        return $this->normalizedPhone($phone);
    }
}
