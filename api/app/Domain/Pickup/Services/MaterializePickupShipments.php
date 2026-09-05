<?php

namespace App\Domain\Pickup\Services;

use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Pickup\Models\PickupReviewEvent;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Actions\CreateShipment;
use App\Domain\Shipment\Actions\TransitionShipmentStatus;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class MaterializePickupShipments
{
    public function __construct(
        private readonly CreateShipment $createShipment,
        private readonly TransitionShipmentStatus $transitionShipmentStatus,
    ) {}

    /**
     * @param  array{default_shipping_cost: int, default_driver_fee: int, non_cod_payment_type?: string|null}  $pricing
     * @param  list<int>|null  $packageIds
     * @return array{pickup_request: PickupRequest, created_count: int}
     */
    public function execute(
        PickupRequest $pickupRequest,
        array $pricing,
        User $actor,
        ?array $packageIds = null,
    ): array {
        return DB::transaction(function () use ($pickupRequest, $pricing, $actor, $packageIds) {
            $request = PickupRequest::query()
                ->with('customer')
                ->lockForUpdate()
                ->findOrFail($pickupRequest->getKey());

            if (! in_array($request->status, [
                PickupStatus::ACCEPTED,
                PickupStatus::READY_FOR_ASSIGNMENT,
                PickupStatus::ASSIGNED,
                PickupStatus::DRIVER_ON_THE_WAY,
                PickupStatus::PARTIALLY_PICKED_UP,
                PickupStatus::PICKED_UP,
            ], true)) {
                throw ValidationException::withMessages([
                    'pickup_request' => 'La solicitud debe estar aprobada antes de crear envíos.',
                ]);
            }

            $requestedIds = $packageIds === null
                ? null
                : array_values(array_unique(array_map('intval', $packageIds)));
            $packagesQuery = PickupPackage::query()
                ->where('pickup_request_id', $request->id)
                ->orderBy('package_index')
                ->lockForUpdate();
            if ($requestedIds !== null) {
                $packagesQuery->whereIn('id', $requestedIds);
            }
            $packages = $packagesQuery->get();

            if ($requestedIds !== null && $packages->count() !== count($requestedIds)) {
                throw ValidationException::withMessages([
                    'package_ids' => 'Uno o más paquetes no pertenecen a la solicitud.',
                ]);
            }

            $before = $request->toArray();
            $createdCount = 0;
            foreach ($packages as $package) {
                if ($package->shipment_id !== null) {
                    continue;
                }

                $paymentType = $package->payment_type ?: ($package->is_cod ? 'cash_on_delivery' : $this->resolveNonCodPaymentType($pricing['non_cod_payment_type'] ?? null));
                $isCod = $paymentType === 'cash_on_delivery';

                $shipmentData = [
                    'client_id' => $request->customer_id,
                    'sender_name' => $request->contact_name,
                    'sender_phone' => $request->contact_phone,
                    'sender_email' => $request->contact_email,
                    'sender_company' => $request->sender_company ?: $request->customer?->company,
                    'recipient_name' => $package->recipient_name,
                    'recipient_phone' => $package->recipient_phone,
                    'recipient_address' => $this->composeRecipientAddress($package),
                    'recipient_zone' => $package->delivery_zone,
                    'recipient_city' => $package->delivery_city,
                    'delivery_instructions' => $package->special_handling_notes ?: $request->special_instructions,
                    'payment_type' => $paymentType,
                    'shipping_cost' => (int) $pricing['default_shipping_cost'],
                    'cod_amount' => $isCod ? (int) $package->requested_cod_amount : 0,
                    'driver_fee' => (int) $pricing['default_driver_fee'],
                    'notes' => $this->composeShipmentNotes($request, $package),
                ];

                if (Schema::hasColumn('shipments', 'size_code')) {
                    $shipmentData['size_code'] = $package->size_code;
                }
                if (Schema::hasColumn('shipments', 'is_fragile')) {
                    $shipmentData['is_fragile'] = (bool) $package->is_fragile;
                }
                if (Schema::hasColumn('shipments', 'approx_weight_kg')) {
                    $shipmentData['approx_weight_kg'] = $package->approx_weight_kg;
                }

                $shipment = $this->createShipment->execute($shipmentData, $actor);

                $shipment = $this->transitionShipmentStatus->execute(
                    $shipment,
                    ShipmentStatus::CONFIRMED,
                    $actor,
                    "Envío confirmado desde solicitud de ingreso {$request->pickup_code}.",
                );
                $shipment = $this->transitionShipmentStatus->execute(
                    $shipment,
                    ShipmentStatus::PICKUP_SCHEDULED,
                    $actor,
                    "Envío creado desde solicitud de ingreso {$request->pickup_code}.",
                );

                $package->forceFill([
                    'shipment_id' => $shipment->id,
                    'guide_number' => $shipment->tracking_code,
                    'qr_reference' => $shipment->tracking_code,
                ])->save();
                $createdCount++;
            }

            if ($createdCount > 0 && $request->status === PickupStatus::ACCEPTED) {
                $request->forceFill([
                    'status' => PickupStatus::READY_FOR_ASSIGNMENT->value,
                    'ready_for_assignment_at' => $request->ready_for_assignment_at ?? now(),
                ])->save();
            }

            $now = now();
            PickupReviewEvent::query()->create([
                'pickup_request_id' => $request->id,
                'event_type' => 'SHIPMENTS_MATERIALIZED',
                'notes' => $createdCount > 0
                    ? "{$createdCount} envío(s) creados desde la solicitud de ingreso."
                    : 'Los paquetes seleccionados ya tenían una guía asociada.',
                'old_values_json' => $before,
                'new_values_json' => $request->fresh()->toArray(),
                'actor_type' => 'user',
                'actor_id' => $actor->id,
                'occurred_at' => $now,
                'created_at' => $now,
            ]);

            AuditLog::log(
                'operations.pickup_request_materialized',
                $request,
                $before,
                $request->fresh()->toArray(),
                "Solicitud {$request->pickup_code} materializada en {$createdCount} envío(s).",
            );

            return [
                'pickup_request' => $request->refresh(),
                'created_count' => $createdCount,
            ];
        });
    }

    private function composeRecipientAddress(PickupPackage $package): string
    {
        return trim(implode(', ', array_filter([
            $package->delivery_address_line1,
            $package->delivery_address_complement,
        ])));
    }

    private function composeShipmentNotes(PickupRequest $request, PickupPackage $package): string
    {
        return trim(implode(' ', array_filter([
            "Creado desde solicitud de ingreso {$request->pickup_code}.",
            $request->special_instructions,
            $package->special_handling_notes,
        ])));
    }

    private function resolveNonCodPaymentType(?string $requested): string
    {
        if ($requested !== null) {
            return $requested;
        }

        // La preferencia del cliente es informativa. El tipo real debe venir
        // por paquete; si no se especifica, usamos el valor operativo seguro.
        return 'post_sale';
    }
}
