<?php

namespace App\Http\Controllers\Api;

use App\Domain\Client\Models\Client;
use App\Domain\Shared\Models\AuditLog;
use App\Http\Controllers\Controller;
use App\Integrations\WhatsApp\Enums\CustomerWhatsAppContactStatus;
use App\Integrations\WhatsApp\Enums\WhatsAppLinkRequestStatus;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContact;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContactPermission;
use App\Integrations\WhatsApp\Models\WhatsAppLinkRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WhatsAppLinkRequestController extends Controller
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

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'in:PENDING,APPROVED,REJECTED,EXPIRED'],
            'customer_id' => ['nullable', 'integer', 'exists:clients,id'],
            'search' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = WhatsAppLinkRequest::query()
            ->with(['whatsappContact', 'requestedCustomer:id,name,company'])
            ->when($filters['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($filters['customer_id'] ?? null, fn ($query, $customerId) => $query->where('requested_customer_id', $customerId))
            ->when($filters['search'] ?? null, function ($query, $search) {
                $query->where(function ($query) use ($search) {
                    $query->where('requested_company_name', 'like', "%{$search}%")
                        ->orWhere('requested_by_phone', 'like', "%{$search}%")
                        ->orWhereHas('whatsappContact', fn ($query) => $query
                            ->where('phone', 'like', "%{$search}%")
                            ->orWhere('wa_id', 'like', "%{$search}%")
                            ->orWhere('display_name', 'like', "%{$search}%"))
                        ->orWhereHas('requestedCustomer', fn ($query) => $query
                            ->where('name', 'like', "%{$search}%")
                            ->orWhere('company', 'like', "%{$search}%"));
                });
            })
            ->orderByRaw("CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END")
            ->orderByDesc('created_at');

        return response()->json($query->paginate((int) ($filters['per_page'] ?? 25)));
    }

    public function approve(Request $request, WhatsAppLinkRequest $linkRequest): JsonResponse
    {
        $validated = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:clients,id'],
            'role' => ['nullable', 'string', 'max:60'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', 'in:'.implode(',', self::ALLOWED_WHATSAPP_PERMISSIONS)],
        ]);

        if ($linkRequest->status !== WhatsAppLinkRequestStatus::PENDING) {
            return response()->json([
                'message' => 'La solicitud de vinculación ya fue procesada.',
            ], 422);
        }

        $customer = Client::query()->find($validated['customer_id'] ?? $linkRequest->requested_customer_id);

        if (! $customer) {
            return response()->json([
                'message' => 'Debe seleccionar un cliente válido para aprobar la vinculación.',
            ], 422);
        }

        DB::transaction(function () use ($request, $validated, $linkRequest, $customer) {
            $contactLink = CustomerWhatsAppContact::query()->firstOrNew([
                'customer_id' => $customer->id,
                'whatsapp_contact_id' => $linkRequest->whatsapp_contact_id,
            ]);

            $contactLink->fill([
                'role' => $validated['role'] ?? $contactLink->role,
                'status' => CustomerWhatsAppContactStatus::AUTHORIZED->value,
                'authorized_at' => $contactLink->authorized_at ?? now(),
                'authorized_by' => $contactLink->authorized_by ?? $request->user()?->id,
                'revoked_at' => null,
                'revoked_by' => null,
            ]);
            $contactLink->save();

            $contactLink->permissions()->delete();

            foreach (array_values(array_unique($validated['permissions'] ?? ['CREATE_PICKUP', 'VIEW_OWN_PICKUPS', 'USE_SAVED_ADDRESSES'])) as $permission) {
                CustomerWhatsAppContactPermission::query()->create([
                    'customer_whatsapp_contact_id' => $contactLink->id,
                    'permission' => $permission,
                    'created_at' => now(),
                ]);
            }

            $linkRequest->forceFill([
                'requested_customer_id' => $customer->id,
                'status' => WhatsAppLinkRequestStatus::APPROVED->value,
                'approved_by' => $request->user()?->id,
                'approved_at' => now(),
                'rejected_by' => null,
                'rejected_at' => null,
                'rejection_reason' => null,
            ])->save();

            AuditLog::log(
                action: 'whatsapp.link_request_approved',
                entity: $customer,
                newValues: $linkRequest->fresh(['whatsappContact', 'requestedCustomer'])?->toArray(),
                description: "Solicitud de vinculación WhatsApp aprobada para cliente {$customer->name}."
            );
        });

        return response()->json(
            $linkRequest->fresh(['whatsappContact', 'requestedCustomer'])
        );
    }

    public function reject(Request $request, WhatsAppLinkRequest $linkRequest): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        if ($linkRequest->status !== WhatsAppLinkRequestStatus::PENDING) {
            return response()->json([
                'message' => 'La solicitud de vinculación ya fue procesada.',
            ], 422);
        }

        $linkRequest->forceFill([
            'status' => WhatsAppLinkRequestStatus::REJECTED->value,
            'rejected_by' => $request->user()?->id,
            'rejected_at' => now(),
            'rejection_reason' => $validated['reason'],
            'notes' => $validated['notes'] ?? $linkRequest->notes,
        ])->save();

        AuditLog::log(
            action: 'whatsapp.link_request_rejected',
            entity: $linkRequest->requestedCustomer,
            newValues: $linkRequest->fresh(['whatsappContact', 'requestedCustomer'])?->toArray(),
            description: 'Solicitud de vinculación WhatsApp rechazada.'
        );

        return response()->json($linkRequest->fresh(['whatsappContact', 'requestedCustomer']));
    }
}
