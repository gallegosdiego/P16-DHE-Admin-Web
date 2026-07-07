<?php

namespace App\Integrations\WhatsApp\Services;

use App\Domain\Client\Models\Client;
use App\Domain\Pickup\Enums\CoverageStatus;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Pickup\Models\PickupReviewEvent;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\Shipment;
use App\Integrations\WhatsApp\Enums\CustomerWhatsAppContactStatus;
use App\Integrations\WhatsApp\Enums\WhatsAppCustomerStatus;
use App\Integrations\WhatsApp\Enums\WhatsAppFlowSubmissionStatus;
use App\Integrations\WhatsApp\Enums\WhatsAppLinkRequestStatus;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContact;
use App\Integrations\WhatsApp\Models\WhatsAppContact;
use App\Integrations\WhatsApp\Models\WhatsAppFlowSubmission;
use App\Integrations\WhatsApp\Models\WhatsAppLinkRequest;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PickupFlowSubmissionProcessor
{
    /**
     * @param array{
     *     provider_message_id:string,
     *     wa_id:string,
     *     display_name:?string,
     *     flow_id:string,
     *     submission_id:string,
     *     response:array<string, mixed>
     * } $submission
     */
    public function process(array $submission, string $correlationId): void
    {
        DB::transaction(function () use ($submission, $correlationId) {
            $contact = $this->firstOrCreateContact($submission);

            $existingSubmission = WhatsAppFlowSubmission::query()
                ->where('submission_id', $submission['submission_id'])
                ->first();

            if ($existingSubmission) {
                return;
            }

            $authorizedLink = $this->resolveAuthorizedLink($contact);

            if (! $authorizedLink) {
                $this->createUnauthorizedContactArtifacts($submission, $contact, $correlationId);

                return;
            }

            $payload = $this->normalizeFlowPayload($submission['response']);
            $customer = $authorizedLink->customer;

            $status = $this->decidePickupStatus($authorizedLink, $payload);
            $reviewReason = $this->resolveReviewReason($authorizedLink, $payload, $status);
            $requestedCodTotal = $this->calculateRequestedCodTotal($payload['packages']);
            $pickupCode = $this->generatePickupCode();
            $now = now();

            $pickup = PickupRequest::query()->create([
                'pickup_code' => $pickupCode,
                'customer_id' => $customer->id,
                'customer_whatsapp_contact_id' => $authorizedLink->id,
                'source' => 'whatsapp',
                'status' => $status->value,
                'review_reason_code' => $reviewReason,
                'pickup_address_line1' => $payload['pickup_address_line1'],
                'pickup_address_complement' => $payload['pickup_address_complement'],
                'pickup_zone' => $payload['pickup_zone'],
                'pickup_city' => $payload['pickup_city'],
                'coverage_status' => $payload['coverage_status']->value,
                'contact_name' => $payload['contact_name'],
                'contact_phone' => $payload['contact_phone'],
                'pickup_window_code' => $payload['pickup_window_code'],
                'pickup_window_label' => $payload['pickup_window_label'],
                'package_count' => count($payload['packages']),
                'requested_cod_total' => $requestedCodTotal,
                'special_instructions' => $payload['special_instructions'],
                'correlation_id' => $correlationId,
                'submitted_at' => $now,
                'accepted_at' => $status === PickupStatus::ACCEPTED ? $now : null,
            ]);

            foreach ($payload['packages'] as $index => $package) {
                PickupPackage::query()->create([
                    'pickup_request_id' => $pickup->id,
                    'package_index' => $index + 1,
                    'recipient_name' => $package['recipient_name'],
                    'recipient_phone' => $package['recipient_phone'],
                    'delivery_address_line1' => $package['delivery_address_line1'],
                    'delivery_address_complement' => $package['delivery_address_complement'],
                    'delivery_zone' => $package['delivery_zone'],
                    'delivery_city' => $package['delivery_city'],
                    'is_cod' => $package['is_cod'],
                    'requested_cod_amount' => $package['requested_cod_amount'],
                    'is_fragile' => $package['is_fragile'],
                    'package_type' => $package['package_type'],
                    'size_code' => $package['size_code'],
                    'approx_weight_kg' => $package['approx_weight_kg'],
                    'special_handling_notes' => $package['special_handling_notes'],
                ]);
            }

            if ($status === PickupStatus::PENDING_REVIEW) {
                PickupReviewEvent::query()->create([
                    'pickup_request_id' => $pickup->id,
                    'event_type' => 'ENTERED_REVIEW',
                    'reason_code' => $reviewReason,
                    'notes' => 'Solicitud creada desde WhatsApp y enviada a revision manual.',
                    'actor_type' => 'system',
                    'occurred_at' => $now,
                    'created_at' => $now,
                ]);
            }

            WhatsAppFlowSubmission::query()->create([
                'submission_id' => $submission['submission_id'],
                'flow_id' => $submission['flow_id'],
                'whatsapp_contact_id' => $contact->id,
                'customer_id' => $customer->id,
                'pickup_request_id' => $pickup->id,
                'status' => WhatsAppFlowSubmissionStatus::PROCESSED->value,
                'payload_json' => $submission['response'],
                'payload_hash' => hash('sha256', json_encode($submission['response'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)),
                'processed_at' => $now,
                'correlation_id' => $correlationId,
            ]);
        });
    }

    public function resolveCustomerVisibleStatus(PickupRequest $pickup, ?Shipment $shipment = null): WhatsAppCustomerStatus
    {
        if ($shipment && $shipment->status === ShipmentStatus::DELIVERED) {
            return WhatsAppCustomerStatus::DELIVERY_CONFIRMED;
        }

        return match ($pickup->status) {
            PickupStatus::PENDING_REVIEW,
            PickupStatus::NEEDS_CUSTOMER_INPUT => WhatsAppCustomerStatus::PENDING_REVIEW,
            PickupStatus::ACCEPTED,
            PickupStatus::READY_FOR_ASSIGNMENT,
            PickupStatus::ASSIGNED,
            PickupStatus::DRIVER_ON_THE_WAY,
            PickupStatus::PARTIALLY_PICKED_UP,
            PickupStatus::PICKED_UP => WhatsAppCustomerStatus::ACCEPTED,
            default => WhatsAppCustomerStatus::REQUEST_RECEIVED,
        };
    }

    /**
     * @param array{
     *     wa_id:string,
     *     display_name:?string
     * } $submission
     */
    private function firstOrCreateContact(array $submission): WhatsAppContact
    {
        return WhatsAppContact::query()->firstOrCreate(
            ['wa_id' => $submission['wa_id']],
            [
                'phone' => $this->normalizePhone($submission['wa_id']),
                'display_name' => $submission['display_name'],
                'verification_status' => 'KNOWN',
            ],
        );
    }

    private function resolveAuthorizedLink(WhatsAppContact $contact): ?CustomerWhatsAppContact
    {
        $requiredPermission = (string) config('whatsapp_pickups.required_permission', 'CREATE_PICKUP');

        return $contact->customerLinks()
            ->with(['permissions', 'customer.whatsappSettings'])
            ->where('status', CustomerWhatsAppContactStatus::AUTHORIZED->value)
            ->get()
            ->first(function (CustomerWhatsAppContact $link) use ($requiredPermission) {
                return $link->hasPermission($requiredPermission);
            });
    }

    /**
     * @param array{
     *     submission_id:string,
     *     flow_id:string,
     *     response:array<string, mixed>
     * } $submission
     */
    private function createUnauthorizedContactArtifacts(array $submission, WhatsAppContact $contact, string $correlationId): void
    {
        $requestedCustomerId = Arr::get($submission['response'], 'customer_id');
        $requestedCustomer = is_numeric($requestedCustomerId)
            ? Client::query()->find((int) $requestedCustomerId)
            : null;

        WhatsAppLinkRequest::query()->firstOrCreate(
            [
                'whatsapp_contact_id' => $contact->id,
                'requested_customer_id' => $requestedCustomer?->id,
                'status' => WhatsAppLinkRequestStatus::PENDING->value,
            ],
            [
                'requested_company_name' => (string) Arr::get($submission['response'], 'customer_name', $requestedCustomer?->name),
                'requested_by_phone' => $this->normalizePhone($contact->wa_id),
                'notes' => 'Contacto sin autorizacion para recogidas por WhatsApp.',
            ],
        );

        WhatsAppFlowSubmission::query()->create([
            'submission_id' => $submission['submission_id'],
            'flow_id' => $submission['flow_id'],
            'whatsapp_contact_id' => $contact->id,
            'customer_id' => $requestedCustomer?->id,
            'status' => WhatsAppFlowSubmissionStatus::FAILED->value,
            'payload_json' => $submission['response'],
            'payload_hash' => hash('sha256', json_encode($submission['response'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)),
            'processed_at' => now(),
            'correlation_id' => $correlationId,
        ]);
    }

    /**
     * @param array<string, mixed> $response
     * @return array{
     *     pickup_address_line1:string,
     *     pickup_address_complement:?string,
     *     pickup_zone:?string,
     *     pickup_city:string,
     *     coverage_status:CoverageStatus,
     *     contact_name:string,
     *     contact_phone:string,
     *     pickup_window_code:string,
     *     pickup_window_label:string,
     *     special_instructions:?string,
     *     packages:list<array{
     *         recipient_name:string,
     *         recipient_phone:string,
     *         delivery_address_line1:string,
     *         delivery_address_complement:?string,
     *         delivery_zone:?string,
     *         delivery_city:string,
     *         is_cod:bool,
     *         requested_cod_amount:int,
     *         is_fragile:bool,
     *         package_type:?string,
     *         size_code:?string,
     *         approx_weight_kg:?float,
     *         special_handling_notes:?string
     *     }>
     * }
     */
    private function normalizeFlowPayload(array $response): array
    {
        $pickupCity = trim((string) Arr::get($response, 'pickup_city', config('whatsapp_pickups.default_pickup_city', 'Bogota')));
        $packages = [];

        foreach ((array) Arr::get($response, 'packages', []) as $package) {
            $packages[] = [
                'recipient_name' => trim((string) Arr::get($package, 'recipient_name', '')),
                'recipient_phone' => $this->normalizePhone((string) Arr::get($package, 'recipient_phone', '')),
                'delivery_address_line1' => trim((string) Arr::get($package, 'delivery_address_line1', '')),
                'delivery_address_complement' => $this->nullableString(Arr::get($package, 'delivery_address_complement')),
                'delivery_zone' => $this->nullableString(Arr::get($package, 'delivery_zone')),
                'delivery_city' => trim((string) Arr::get($package, 'delivery_city', $pickupCity)),
                'is_cod' => (bool) Arr::get($package, 'is_cod', false),
                'requested_cod_amount' => max(0, (int) Arr::get($package, 'requested_cod_amount', 0)),
                'is_fragile' => (bool) Arr::get($package, 'is_fragile', false),
                'package_type' => $this->nullableString(Arr::get($package, 'package_type')),
                'size_code' => $this->nullableString(Arr::get($package, 'size_code')),
                'approx_weight_kg' => is_numeric(Arr::get($package, 'approx_weight_kg'))
                    ? (float) Arr::get($package, 'approx_weight_kg')
                    : null,
                'special_handling_notes' => $this->nullableString(Arr::get($package, 'special_handling_notes')),
            ];
        }

        return [
            'pickup_address_line1' => trim((string) Arr::get($response, 'pickup_address_line1', '')),
            'pickup_address_complement' => $this->nullableString(Arr::get($response, 'pickup_address_complement')),
            'pickup_zone' => $this->nullableString(Arr::get($response, 'pickup_zone')),
            'pickup_city' => $pickupCity,
            'coverage_status' => $this->resolveCoverageStatus($pickupCity),
            'contact_name' => trim((string) Arr::get($response, 'contact_name', '')),
            'contact_phone' => $this->normalizePhone((string) Arr::get($response, 'contact_phone', '')),
            'pickup_window_code' => trim((string) Arr::get($response, 'pickup_window_code', 'today_pm')),
            'pickup_window_label' => trim((string) Arr::get($response, 'pickup_window_label', 'Segunda jornada')),
            'special_instructions' => $this->nullableString(Arr::get($response, 'special_instructions')),
            'packages' => $packages,
        ];
    }

    private function decidePickupStatus(CustomerWhatsAppContact $authorizedLink, array $payload): PickupStatus
    {
        return $this->resolveReviewReason($authorizedLink, $payload, null) === null
            ? PickupStatus::ACCEPTED
            : PickupStatus::PENDING_REVIEW;
    }

    private function resolveReviewReason(CustomerWhatsAppContact $authorizedLink, array $payload, ?PickupStatus $status): ?string
    {
        if ($status === PickupStatus::ACCEPTED) {
            return null;
        }

        $settings = $authorizedLink->customer->whatsappSettings;
        $packageCount = count($payload['packages']);
        $requestedCodTotal = $this->calculateRequestedCodTotal($payload['packages']);

        if (! $settings || ! $settings->status->canStartAutomaticPickup()) {
            return 'WHATSAPP_CUSTOMER_DISABLED';
        }

        if ($payload['pickup_address_line1'] === '' || $payload['contact_name'] === '' || $payload['contact_phone'] === '') {
            return 'INVALID_INFORMATION';
        }

        if ($packageCount === 0) {
            return 'NO_PACKAGES';
        }

        foreach ($payload['packages'] as $package) {
            if ($package['recipient_name'] === '' || $package['recipient_phone'] === '' || $package['delivery_address_line1'] === '') {
                return 'INVALID_INFORMATION';
            }
        }

        if ($payload['coverage_status'] !== CoverageStatus::IN_COVERAGE) {
            return $payload['coverage_status'] === CoverageStatus::OUT_OF_COVERAGE
                ? 'PICKUP_OUT_OF_COVERAGE'
                : 'PICKUP_COVERAGE_UNRESOLVED';
        }

        if (! in_array($payload['pickup_window_code'], (array) ($settings?->allowed_windows_json ?? []), true)) {
            return 'PICKUP_WINDOW_UNAVAILABLE';
        }

        if ($packageCount > (int) ($settings?->automatic_package_limit ?? 0)) {
            return 'PICKUP_PACKAGE_LIMIT_EXCEEDED';
        }

        if ($requestedCodTotal > (int) ($settings?->automatic_cod_total_limit ?? 0)) {
            return 'PICKUP_COD_LIMIT_EXCEEDED';
        }

        foreach ($payload['packages'] as $package) {
            if ($package['is_cod'] && ! (bool) ($settings?->cod_enabled ?? false)) {
                return 'PICKUP_COD_NOT_ENABLED';
            }

            if ($package['requested_cod_amount'] > (int) ($settings?->automatic_cod_limit ?? 0)) {
                return 'PICKUP_COD_LIMIT_EXCEEDED';
            }
        }

        return null;
    }

    /**
     * @param list<array{requested_cod_amount:int}> $packages
     */
    private function calculateRequestedCodTotal(array $packages): int
    {
        return array_sum(array_map(
            static fn (array $package): int => (int) ($package['requested_cod_amount'] ?? 0),
            $packages,
        ));
    }

    private function resolveCoverageStatus(string $city): CoverageStatus
    {
        $normalizedCity = Str::of($city)->trim()->lower()->toString();
        $supportedCities = array_map(
            static fn (string $value): string => Str::of($value)->trim()->lower()->toString(),
            (array) config('whatsapp_pickups.supported_pickup_cities', []),
        );

        return in_array($normalizedCity, $supportedCities, true)
            ? CoverageStatus::IN_COVERAGE
            : CoverageStatus::OUT_OF_COVERAGE;
    }

    private function generatePickupCode(): string
    {
        do {
            $code = 'PK-'.now()->format('Ymd').'-'.strtoupper(Str::random(6));
        } while (PickupRequest::query()->where('pickup_code', $code)->exists());

        return $code;
    }

    private function normalizePhone(string $value): string
    {
        return preg_replace('/\D+/', '', $value) ?: '';
    }

    private function nullableString(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));

        return $normalized === '' ? null : $normalized;
    }
}
