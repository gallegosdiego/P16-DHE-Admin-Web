<?php

namespace App\Http\Controllers\Api;

use App\Domain\Operations\Enums\IntakeMode;
use App\Domain\Pickup\Enums\CoverageStatus;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Pickup\Models\PickupReviewEvent;
use App\Domain\Pickup\Services\MaterializePickupShipments;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Http\Controllers\Controller;
use App\Integrations\WhatsApp\Enums\WhatsAppNotificationType;
use App\Integrations\WhatsApp\Models\WhatsAppMessage;
use App\Integrations\WhatsApp\Services\PickupFlowSubmissionProcessor;
use App\Integrations\WhatsApp\Services\PickupWhatsAppNotifier;
use App\Integrations\WhatsApp\Services\RetryWhatsAppMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use InvalidArgumentException;

class PickupRequestController extends Controller
{
    public function readiness(): JsonResponse
    {
        $checks = [
            [
                'key' => 'meta_app_secret',
                'label' => 'Meta App Secret',
                'ready' => trim((string) config('services.whatsapp.app_secret', '')) !== '',
                'required_for_live' => true,
            ],
            [
                'key' => 'whatsapp_verify_token',
                'label' => 'Webhook Verify Token',
                'ready' => trim((string) config('services.whatsapp.verify_token', '')) !== '',
                'required_for_live' => true,
            ],
            [
                'key' => 'whatsapp_access_token',
                'label' => 'WhatsApp Access Token',
                'ready' => trim((string) config('services.whatsapp.access_token', '')) !== '',
                'required_for_live' => true,
            ],
            [
                'key' => 'whatsapp_phone_number_id',
                'label' => 'WhatsApp Phone Number ID',
                'ready' => trim((string) config('services.whatsapp.phone_number_id', '')) !== '',
                'required_for_live' => true,
            ],
            [
                'key' => 'supported_pickup_cities',
                'label' => 'Ciudades de cobertura configuradas',
                'ready' => count((array) config('whatsapp_pickups.supported_pickup_cities', [])) > 0,
                'required_for_live' => true,
            ],
        ];

        $requiredChecks = collect($checks)->filter(fn (array $check): bool => $check['required_for_live']);
        $readyChecks = $requiredChecks->filter(fn (array $check): bool => $check['ready']);
        $outboundEnabled = (bool) config('whatsapp_pickups.outbound_enabled', false);
        $canSendLive = $outboundEnabled && $readyChecks->count() === $requiredChecks->count();

        return response()->json([
            'status' => $canSendLive ? 'ready_for_sandbox' : 'configuration_pending',
            'status_label' => $canSendLive ? 'Lista para sandbox Meta' : 'Configuracion pendiente',
            'outbound_enabled' => $outboundEnabled,
            'can_send_live' => $canSendLive,
            'ready_checks' => $readyChecks->count(),
            'required_checks' => $requiredChecks->count(),
            'supported_pickup_cities_count' => count((array) config('whatsapp_pickups.supported_pickup_cities', [])),
            'recommended_next_step' => $canSendLive
                ? 'Ejecutar una prueba punta a punta en sandbox Meta con un numero controlado.'
                : 'Completar secretos y activar el modo saliente antes de probar en Meta.',
            'checks' => $checks,
        ]);
    }

    public function index(Request $request, PickupFlowSubmissionProcessor $processor): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'string', 'max:40'],
            'customer_visible_status' => ['nullable', 'in:request_received,pending_review,accepted,delivery_confirmed'],
            'search' => ['nullable', 'string', 'max:120'],
            'customer_id' => ['nullable', 'integer', 'exists:clients,id'],
            'intake_mode' => ['nullable', 'string', Rule::enum(IntakeMode::class)],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = PickupRequest::query()
            ->with([
                'customer:id,name,company,phone',
                'serviceLocation:id,name,address_line1,city',
                'customerWhatsAppContact.whatsappContact:id,wa_id,phone,display_name',
                'packages.shipment:id,display_code,tracking_code,status,driver_id,delivered_at',
                'packages.shipment.driver:id,name',
            ])
            ->when($filters['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($filters['customer_id'] ?? null, fn ($query, $customerId) => $query->where('customer_id', $customerId))
            ->when($filters['intake_mode'] ?? null, fn ($query, $intakeMode) => $query->where('intake_mode', $intakeMode))
            ->when($filters['search'] ?? null, function ($query, $search) {
                $query->where(function ($query) use ($search) {
                    $query->where('pickup_code', 'like', "%{$search}%")
                        ->orWhere('contact_name', 'like', "%{$search}%")
                        ->orWhere('contact_phone', 'like', "%{$search}%")
                        ->orWhere('pickup_address_line1', 'like', "%{$search}%")
                        ->orWhereHas('customer', fn ($query) => $query
                            ->where('name', 'like', "%{$search}%")
                            ->orWhere('company', 'like', "%{$search}%"));
                });
            })
            ->orderByRaw("
                CASE status
                    WHEN 'pending_review' THEN 0
                    WHEN 'needs_customer_input' THEN 1
                    WHEN 'accepted' THEN 2
                    WHEN 'ready_for_assignment' THEN 3
                    ELSE 4
                END
            ")
            ->orderByDesc('submitted_at')
            ->orderByDesc('id');

        $paginated = $query->paginate((int) ($filters['per_page'] ?? 20));

        $rows = collect($paginated->items())
            ->map(fn (PickupRequest $pickupRequest) => $this->pickupPayload($pickupRequest, $processor))
            ->values();

        if (($filters['customer_visible_status'] ?? null) !== null) {
            $rows = $rows
                ->filter(fn (array $row) => $row['customer_visible_status'] === $filters['customer_visible_status'])
                ->values();
        }

        $summaryBase = PickupRequest::query()
            ->when($filters['customer_id'] ?? null, fn ($query, $customerId) => $query->where('customer_id', $customerId))
            ->when($filters['intake_mode'] ?? null, fn ($query, $intakeMode) => $query->where('intake_mode', $intakeMode))
            ->when($filters['search'] ?? null, function ($query, $search) {
                $query->where(function ($query) use ($search) {
                    $query->where('pickup_code', 'like', "%{$search}%")
                        ->orWhere('contact_name', 'like', "%{$search}%")
                        ->orWhere('contact_phone', 'like', "%{$search}%")
                        ->orWhere('pickup_address_line1', 'like', "%{$search}%")
                        ->orWhereHas('customer', fn ($query) => $query
                            ->where('name', 'like', "%{$search}%")
                            ->orWhere('company', 'like', "%{$search}%"));
                });
            });

        $byStatus = (clone $summaryBase)
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return response()->json([
            ...$paginated->toArray(),
            'data' => $rows,
            'summary' => [
                'total' => (clone $summaryBase)->count(),
                'pending_review' => (int) ($byStatus[PickupStatus::PENDING_REVIEW->value] ?? 0),
                'needs_customer_input' => (int) ($byStatus[PickupStatus::NEEDS_CUSTOMER_INPUT->value] ?? 0),
                'accepted' => (int) ($byStatus[PickupStatus::ACCEPTED->value] ?? 0),
                'ready_for_assignment' => (int) ($byStatus[PickupStatus::READY_FOR_ASSIGNMENT->value] ?? 0),
                'cancelled' => (int) ($byStatus[PickupStatus::CANCELLED->value] ?? 0),
            ],
        ]);
    }

    public function show(PickupRequest $pickupRequest, PickupFlowSubmissionProcessor $processor): JsonResponse
    {
        $pickupRequest->load([
            'customer:id,name,company,phone',
            'serviceLocation:id,name,address_line1,city',
            'customerWhatsAppContact.whatsappContact:id,wa_id,phone,display_name',
            'packages.shipment:id,display_code,tracking_code,status,driver_id,delivered_at',
            'packages.shipment.driver:id,name',
            'reviewEvents',
            'whatsappMessages.whatsappContact:id,wa_id,phone,display_name',
        ]);

        return response()->json($this->pickupPayload($pickupRequest, $processor, true));
    }

    public function approve(
        Request $request,
        PickupRequest $pickupRequest,
        PickupFlowSubmissionProcessor $processor,
        PickupWhatsAppNotifier $notifier,
    ): JsonResponse {
        $validated = $request->validate([
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        if (! in_array($pickupRequest->status, [
            PickupStatus::PENDING_REVIEW,
            PickupStatus::NEEDS_CUSTOMER_INPUT,
            PickupStatus::SUBMITTED,
        ], true)) {
            return response()->json([
                'message' => 'La solicitud no se puede aprobar desde su estado actual.',
            ], 422);
        }

        DB::transaction(function () use ($request, $pickupRequest, $validated, $notifier) {
            $before = $pickupRequest->toArray();
            $now = now();

            $pickupRequest->forceFill([
                'status' => PickupStatus::ACCEPTED->value,
                'review_reason_code' => null,
                'accepted_at' => $pickupRequest->accepted_at ?? $now,
            ])->save();

            PickupReviewEvent::query()->create([
                'pickup_request_id' => $pickupRequest->id,
                'event_type' => 'MANUALLY_APPROVED',
                'notes' => $validated['notes'] ?? 'Solicitud aprobada desde el panel administrativo.',
                'old_values_json' => $before,
                'new_values_json' => $pickupRequest->fresh()->toArray(),
                'actor_type' => 'user',
                'actor_id' => $request->user()?->id,
                'occurred_at' => $now,
                'created_at' => $now,
            ]);

            AuditLog::log(
                action: 'whatsapp.pickup_request_approved',
                entity: $pickupRequest,
                oldValues: $before,
                newValues: $pickupRequest->fresh()->toArray(),
                description: "Recogida {$pickupRequest->pickup_code} aprobada manualmente."
            );

            $notifier->notifyAccepted($pickupRequest->fresh(['customerWhatsAppContact.whatsappContact', 'customer']));
        });

        return $this->show($pickupRequest->fresh(), $processor);
    }

    public function requestInput(
        Request $request,
        PickupRequest $pickupRequest,
        PickupFlowSubmissionProcessor $processor,
        PickupWhatsAppNotifier $notifier,
    ): JsonResponse {
        $validated = $request->validate([
            'reason_code' => ['required', 'string', 'max:80'],
            'notes' => ['nullable', 'string', 'max:500'],
            'requested_fields' => ['nullable', 'array'],
            'requested_fields.*' => ['string', 'max:80'],
        ]);

        if (in_array($pickupRequest->status, [
            PickupStatus::CANCELLED,
            PickupStatus::PICKED_UP,
            PickupStatus::PARTIALLY_PICKED_UP,
            PickupStatus::NOT_PICKED_UP,
        ], true)) {
            return response()->json([
                'message' => 'La solicitud no puede volver a pedir datos desde su estado actual.',
            ], 422);
        }

        DB::transaction(function () use ($request, $pickupRequest, $validated, $notifier) {
            $before = $pickupRequest->toArray();
            $now = now();

            $pickupRequest->forceFill([
                'status' => PickupStatus::NEEDS_CUSTOMER_INPUT->value,
                'review_reason_code' => $validated['reason_code'],
            ])->save();

            $reviewEvent = PickupReviewEvent::query()->create([
                'pickup_request_id' => $pickupRequest->id,
                'event_type' => 'CUSTOMER_INPUT_REQUESTED',
                'reason_code' => $validated['reason_code'],
                'notes' => $validated['notes'] ?? 'Se solicitaron datos adicionales al cliente.',
                'requested_fields_json' => array_values(array_unique($validated['requested_fields'] ?? [])),
                'old_values_json' => $before,
                'new_values_json' => $pickupRequest->fresh()->toArray(),
                'actor_type' => 'user',
                'actor_id' => $request->user()?->id,
                'occurred_at' => $now,
                'created_at' => $now,
            ]);

            AuditLog::log(
                action: 'whatsapp.pickup_request_requested_input',
                entity: $pickupRequest,
                oldValues: $before,
                newValues: $pickupRequest->fresh()->toArray(),
                description: "Recogida {$pickupRequest->pickup_code} marcada como requiere datos del cliente."
            );

            $notifier->notifyCustomerInputRequired(
                $pickupRequest->fresh(['customerWhatsAppContact.whatsappContact', 'customer']),
                $reviewEvent
            );
        });

        return $this->show($pickupRequest->fresh(), $processor);
    }

    public function cancel(Request $request, PickupRequest $pickupRequest, PickupFlowSubmissionProcessor $processor): JsonResponse
    {
        $validated = $request->validate([
            'reason_code' => ['required', 'string', 'max:80'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        if (in_array($pickupRequest->status, [
            PickupStatus::CANCELLED,
            PickupStatus::PICKED_UP,
            PickupStatus::PARTIALLY_PICKED_UP,
            PickupStatus::NOT_PICKED_UP,
        ], true)) {
            return response()->json([
                'message' => 'La solicitud no se puede cancelar desde su estado actual.',
            ], 422);
        }

        DB::transaction(function () use ($request, $pickupRequest, $validated) {
            $before = $pickupRequest->toArray();
            $now = now();

            $pickupRequest->forceFill([
                'status' => PickupStatus::CANCELLED->value,
                'review_reason_code' => $validated['reason_code'],
                'cancelled_at' => $now,
            ])->save();

            PickupReviewEvent::query()->create([
                'pickup_request_id' => $pickupRequest->id,
                'event_type' => 'CANCELLED',
                'reason_code' => $validated['reason_code'],
                'notes' => $validated['notes'] ?? 'Solicitud cancelada desde el panel administrativo.',
                'old_values_json' => $before,
                'new_values_json' => $pickupRequest->fresh()->toArray(),
                'actor_type' => 'user',
                'actor_id' => $request->user()?->id,
                'occurred_at' => $now,
                'created_at' => $now,
            ]);

            AuditLog::log(
                action: 'whatsapp.pickup_request_cancelled',
                entity: $pickupRequest,
                oldValues: $before,
                newValues: $pickupRequest->fresh()->toArray(),
                description: "Recogida {$pickupRequest->pickup_code} cancelada."
            );
        });

        return $this->show($pickupRequest->fresh(), $processor);
    }

    public function materializeShipments(
        Request $request,
        PickupRequest $pickupRequest,
        MaterializePickupShipments $materializer,
        PickupFlowSubmissionProcessor $processor,
    ): JsonResponse {
        $validated = $request->validate([
            'default_shipping_cost' => ['required', 'integer', 'min:0'],
            'default_driver_fee' => ['required', 'integer', 'min:0'],
            'non_cod_payment_type' => ['nullable', 'in:cash_on_delivery,post_sale,prepaid,mercado_libre'],
            'package_ids' => ['nullable', 'array', 'min:1'],
            'package_ids.*' => ['required', 'integer', 'distinct'],
        ]);

        $result = $materializer->execute(
            $pickupRequest,
            $validated,
            $request->user(),
            $validated['package_ids'] ?? null,
        );
        $pickupRequest = $result['pickup_request'];
        $createdCount = $result['created_count'];

        $pickupRequest->refresh()->load([
            'customer:id,name,company,phone',
            'customerWhatsAppContact.whatsappContact:id,wa_id,phone,display_name',
            'packages.shipment:id,display_code,tracking_code,status,driver_id,delivered_at',
            'packages.shipment.driver:id,name',
            'reviewEvents',
            'whatsappMessages.whatsappContact:id,wa_id,phone,display_name',
        ]);

        return response()->json([
            'message' => $createdCount > 0
                ? "{$createdCount} envío(s) creados desde la solicitud de ingreso."
                : 'Todos los paquetes seleccionados ya tenían una guía asociada.',
            'pickup_request' => $this->pickupPayload($pickupRequest, $processor, true),
        ]);
    }

    public function retryWhatsAppMessage(
        Request $request,
        PickupRequest $pickupRequest,
        WhatsAppMessage $whatsAppMessage,
        PickupFlowSubmissionProcessor $processor,
        RetryWhatsAppMessage $retryService,
    ): JsonResponse {
        try {
            DB::transaction(function () use ($request, $pickupRequest, $whatsAppMessage, $retryService) {
                $retryMessage = $retryService->execute($pickupRequest, $whatsAppMessage);
                $now = now();

                PickupReviewEvent::query()->create([
                    'pickup_request_id' => $pickupRequest->id,
                    'event_type' => 'WHATSAPP_MESSAGE_RETRIED',
                    'notes' => "Reintento manual del mensaje WhatsApp {$whatsAppMessage->id} hacia nueva tentativa {$retryMessage->id}.",
                    'old_values_json' => [
                        'message_id' => $whatsAppMessage->id,
                        'message_status' => $whatsAppMessage->message_status,
                    ],
                    'new_values_json' => [
                        'message_id' => $retryMessage->id,
                        'message_status' => $retryMessage->message_status,
                    ],
                    'actor_type' => 'user',
                    'actor_id' => $request->user()?->id,
                    'occurred_at' => $now,
                    'created_at' => $now,
                ]);

                AuditLog::log(
                    action: 'whatsapp.pickup_message_retried',
                    entity: $pickupRequest,
                    oldValues: [
                        'message_id' => $whatsAppMessage->id,
                        'message_status' => $whatsAppMessage->message_status,
                    ],
                    newValues: [
                        'message_id' => $retryMessage->id,
                        'message_status' => $retryMessage->message_status,
                    ],
                    description: "Reintento manual de mensaje WhatsApp para la recogida {$pickupRequest->pickup_code}."
                );
            });
        } catch (InvalidArgumentException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], 422);
        }

        $pickupRequest->refresh()->load([
            'customer:id,name,company,phone',
            'customerWhatsAppContact.whatsappContact:id,wa_id,phone,display_name',
            'packages.shipment:id,display_code,tracking_code,status,driver_id,delivered_at',
            'packages.shipment.driver:id,name',
            'reviewEvents',
            'whatsappMessages.whatsappContact:id,wa_id,phone,display_name',
        ]);

        return response()->json([
            'message' => 'Se creo una nueva tentativa de envio WhatsApp.',
            'pickup_request' => $this->pickupPayload($pickupRequest, $processor, true),
        ]);
    }

    private function pickupPayload(
        PickupRequest $pickupRequest,
        PickupFlowSubmissionProcessor $processor,
        bool $includeDetails = false,
    ): array {
        $customerVisibleStatus = $processor->resolveCustomerVisibleStatus(
            $pickupRequest,
            $pickupRequest->packages
                ->map(fn (PickupPackage $package) => $package->shipment)
                ->first(fn ($shipment) => $shipment?->status === ShipmentStatus::DELIVERED)
        );

        $packages = $pickupRequest->packages;
        $materializedPackages = $packages->filter(fn (PickupPackage $package) => $package->shipment_id !== null)->count();
        $deliveredPackages = $packages->filter(fn (PickupPackage $package) => $package->shipment?->status === ShipmentStatus::DELIVERED)->count();
        $customer = $pickupRequest->customer;
        $contactLink = $pickupRequest->customerWhatsAppContact;
        $whatsAppContact = $contactLink?->whatsappContact;

        $payload = [
            'id' => $pickupRequest->id,
            'pickup_code' => $pickupRequest->pickup_code,
            'customer_id' => $pickupRequest->customer_id,
            'customer' => $customer ? [
                'id' => $customer->id,
                'name' => $customer->name,
                'company' => $customer->company,
                'phone' => $customer->phone,
            ] : null,
            'whatsapp_contact' => $whatsAppContact ? [
                'id' => $whatsAppContact->id,
                'wa_id' => $whatsAppContact->wa_id,
                'phone' => $whatsAppContact->phone,
                'display_name' => $whatsAppContact->display_name,
                'role' => $contactLink?->role,
            ] : null,
            'source' => $pickupRequest->source,
            'intake_mode' => $pickupRequest->intake_mode->value,
            'service_location_id' => $pickupRequest->service_location_id,
            'service_location' => $pickupRequest->serviceLocation ? [
                'id' => $pickupRequest->serviceLocation->id,
                'name' => $pickupRequest->serviceLocation->name,
                'address_line1' => $pickupRequest->serviceLocation->address_line1,
                'city' => $pickupRequest->serviceLocation->city,
            ] : null,
            'planned_dropoff_at' => optional($pickupRequest->planned_dropoff_at)?->toISOString(),
            'status' => $pickupRequest->status->value,
            'status_label' => $pickupRequest->status->label(),
            'customer_visible_status' => $customerVisibleStatus->value,
            'customer_visible_status_label' => $customerVisibleStatus->label(),
            'review_reason_code' => $pickupRequest->review_reason_code,
            'pickup_address_line1' => $pickupRequest->pickup_address_line1,
            'pickup_address_complement' => $pickupRequest->pickup_address_complement,
            'pickup_zone' => $pickupRequest->pickup_zone,
            'pickup_city' => $pickupRequest->pickup_city,
            'coverage_status' => $pickupRequest->coverage_status->value,
            'coverage_status_label' => $this->coverageStatusLabel($pickupRequest->coverage_status),
            'contact_name' => $pickupRequest->contact_name,
            'contact_phone' => $pickupRequest->contact_phone,
            'pickup_window_code' => $pickupRequest->pickup_window_code,
            'pickup_window_label' => $pickupRequest->pickup_window_label,
            'package_count' => $pickupRequest->package_count,
            'requested_cod_total' => $pickupRequest->requested_cod_total,
            'special_instructions' => $pickupRequest->special_instructions,
            'correlation_id' => $pickupRequest->correlation_id,
            'submitted_at' => optional($pickupRequest->submitted_at)?->toISOString(),
            'accepted_at' => optional($pickupRequest->accepted_at)?->toISOString(),
            'ready_for_assignment_at' => optional($pickupRequest->ready_for_assignment_at)?->toISOString(),
            'cancelled_at' => optional($pickupRequest->cancelled_at)?->toISOString(),
            'created_at' => optional($pickupRequest->created_at)?->toISOString(),
            'updated_at' => optional($pickupRequest->updated_at)?->toISOString(),
            'shipments_summary' => [
                'total_packages' => $packages->count(),
                'materialized_packages' => $materializedPackages,
                'pending_materialization_packages' => max(0, $packages->count() - $materializedPackages),
                'delivered_packages' => $deliveredPackages,
            ],
        ];

        if (! $includeDetails) {
            return $payload;
        }

        return [
            ...$payload,
            'packages' => $packages->map(function (PickupPackage $package): array {
                return [
                    'id' => $package->id,
                    'package_index' => $package->package_index,
                    'recipient_name' => $package->recipient_name,
                    'recipient_phone' => $package->recipient_phone,
                    'delivery_address_line1' => $package->delivery_address_line1,
                    'delivery_address_complement' => $package->delivery_address_complement,
                    'delivery_zone' => $package->delivery_zone,
                    'delivery_city' => $package->delivery_city,
                    'is_cod' => $package->is_cod,
                    'requested_cod_amount' => $package->requested_cod_amount,
                    'is_fragile' => $package->is_fragile,
                    'package_type' => $package->package_type,
                    'size_code' => $package->size_code,
                    'approx_weight_kg' => $package->approx_weight_kg,
                    'special_handling_notes' => $package->special_handling_notes,
                    'guide_number' => $package->guide_number,
                    'qr_reference' => $package->qr_reference,
                    'shipment' => $package->shipment ? [
                        'id' => $package->shipment->id,
                        'display_code' => $package->shipment->display_code,
                        'tracking_code' => $package->shipment->tracking_code,
                        'status' => $package->shipment->status->value,
                        'status_label' => $package->shipment->status->label(),
                        'driver_name' => $package->shipment->driver?->name,
                        'delivered_at' => optional($package->shipment->delivered_at)?->toISOString(),
                    ] : null,
                ];
            })->values(),
            'review_events' => $pickupRequest->reviewEvents
                ->sortByDesc('occurred_at')
                ->values()
                ->map(fn (PickupReviewEvent $event): array => [
                    'id' => $event->id,
                    'event_type' => $event->event_type,
                    'reason_code' => $event->reason_code,
                    'notes' => $event->notes,
                    'requested_fields' => $event->requested_fields_json ?? [],
                    'old_values' => $event->old_values_json,
                    'new_values' => $event->new_values_json,
                    'actor_type' => $event->actor_type,
                    'actor_id' => $event->actor_id,
                    'occurred_at' => optional($event->occurred_at)?->toISOString(),
                ]),
            'whatsapp_messages' => $pickupRequest->whatsappMessages
                ->values()
                ->map(fn (WhatsAppMessage $message): array => $this->whatsAppMessagePayload($message)),
        ];
    }

    private function whatsAppMessagePayload(WhatsAppMessage $message): array
    {
        $payload = $message->payload_json ?? [];
        $notificationType = WhatsAppNotificationType::tryFrom((string) ($payload['notification_type'] ?? $message->message_type));
        $customerStatus = $notificationType?->customerStatus();

        return [
            'id' => $message->id,
            'direction' => $message->direction,
            'message_type' => $message->message_type,
            'message_status' => $message->message_status,
            'notification_type' => $notificationType?->value,
            'notification_label' => $notificationType?->label(),
            'customer_visible_status' => $customerStatus?->value,
            'customer_visible_status_label' => $customerStatus?->label(),
            'provider_message_id' => $message->provider_message_id,
            'to' => Arr::get($payload, 'to'),
            'body' => Arr::get($payload, 'text'),
            'dispatch_mode' => Arr::get($payload, 'dispatch_mode'),
            'provider_status_event' => Arr::get($payload, 'provider_status_event'),
            'last_error' => Arr::get($payload, 'last_error'),
            'retry_of_message_id' => Arr::get($payload, 'retry_of_message_id'),
            'can_retry' => in_array((string) $message->message_status, ['failed', 'simulated'], true),
            'sent_at' => optional($message->sent_at)?->toISOString(),
            'received_at' => optional($message->received_at)?->toISOString(),
            'created_at' => optional($message->created_at)?->toISOString(),
        ];
    }

    private function coverageStatusLabel(CoverageStatus $coverageStatus): string
    {
        return match ($coverageStatus) {
            CoverageStatus::IN_COVERAGE => 'En cobertura',
            CoverageStatus::NEAR_BOUNDARY => 'Cerca del limite',
            CoverageStatus::OUT_OF_COVERAGE => 'Fuera de cobertura',
            CoverageStatus::UNRESOLVED => 'Cobertura no resuelta',
        };
    }
}
