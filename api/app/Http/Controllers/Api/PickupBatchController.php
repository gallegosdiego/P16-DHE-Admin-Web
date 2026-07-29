<?php

namespace App\Http\Controllers\Api;

use App\Domain\Pickup\Enums\PickupBatchStatus;
use App\Domain\Pickup\Models\PickupBatch;
use App\Domain\Pickup\Models\PickupBatchItem;
use App\Http\Controllers\Controller;
use App\Support\PublicAssetUrl;
use Illuminate\Http\JsonResponse;

class PickupBatchController extends Controller
{
    public function receipt(PickupBatch $pickupBatch): JsonResponse
    {
        $pickupBatch->load([
            'pickupRequest.customer',
            'serviceLocation',
            'receivedByUser:id,name,phone',
            'items.pickupPackage.shipment:id,display_code,tracking_code',
            'items.verifiedBy:id,name',
            'items.evidence',
        ]);

        if (! in_array($pickupBatch->status, [
            PickupBatchStatus::COMPLETED,
            PickupBatchStatus::COMPLETED_WITH_DIFFERENCES,
        ], true)) {
            return response()->json([
                'code' => 'reception_receipt_unavailable',
                'message' => 'El comprobante estará disponible cuando se cierre la conciliación del lote.',
            ], 409);
        }

        return response()->json([
            'data' => [
                'receipt_code' => $pickupBatch->batch_code,
                'batch_id' => $pickupBatch->id,
                'status' => $pickupBatch->status->value,
                'status_label' => $this->statusLabel($pickupBatch->status),
                'intake_mode' => $pickupBatch->intake_mode->value,
                'received_at' => optional($pickupBatch->completed_at ?? $pickupBatch->arrived_at ?? $pickupBatch->created_at)->toISOString(),
                'generated_at' => now()->toISOString(),
                'pickup_request' => [
                    'id' => $pickupBatch->pickupRequest?->id,
                    'pickup_code' => $pickupBatch->pickupRequest?->pickup_code,
                    'source' => $pickupBatch->pickupRequest?->source,
                    'contact_name' => $pickupBatch->pickupRequest?->contact_name,
                    'contact_phone' => $pickupBatch->pickupRequest?->contact_phone,
                ],
                'customer' => $pickupBatch->pickupRequest?->customer ? [
                    'id' => $pickupBatch->pickupRequest->customer->id,
                    'name' => $pickupBatch->pickupRequest->customer->name,
                    'company' => $pickupBatch->pickupRequest->customer->company,
                    'phone' => $pickupBatch->pickupRequest->customer->phone,
                ] : null,
                'service_location' => $pickupBatch->serviceLocation ? [
                    'id' => $pickupBatch->serviceLocation->id,
                    'code' => $pickupBatch->serviceLocation->code,
                    'name' => $pickupBatch->serviceLocation->name,
                    'address_line1' => $pickupBatch->serviceLocation->address_line1,
                    'city' => $pickupBatch->serviceLocation->city,
                ] : null,
                'received_by' => $pickupBatch->receivedByUser ? [
                    'id' => $pickupBatch->receivedByUser->id,
                    'name' => $pickupBatch->receivedByUser->name,
                    'phone' => $pickupBatch->receivedByUser->phone,
                ] : [
                    'id' => null,
                    'name' => $pickupBatch->executor_name,
                    'phone' => null,
                ],
                'delivered_by' => [
                    'name' => $pickupBatch->delivered_by_name,
                    'phone' => $pickupBatch->delivered_by_phone,
                    'relationship' => $pickupBatch->delivered_by_relationship,
                    'notes' => $pickupBatch->notes,
                ],
                'summary' => [
                    'expected_packages' => (int) $pickupBatch->expected_packages,
                    'received_packages' => (int) $pickupBatch->received_packages,
                    'rejected_packages' => (int) $pickupBatch->rejected_packages,
                    'missing_packages' => (int) $pickupBatch->missing_packages,
                    'has_differences' => $pickupBatch->status === PickupBatchStatus::COMPLETED_WITH_DIFFERENCES,
                ],
                'items' => $pickupBatch->items
                    ->sortBy(fn (PickupBatchItem $item) => $item->pickupPackage?->package_index ?? PHP_INT_MAX)
                    ->values()
                    ->map(fn (PickupBatchItem $item): array => $this->itemPayload($item))
                    ->all(),
            ],
        ]);
    }

    private function itemPayload(PickupBatchItem $item): array
    {
        $package = $item->pickupPackage;
        $shipment = $package?->shipment;

        return [
            'id' => $item->id,
            'pickup_package_id' => $item->pickup_package_id,
            'package_index' => $package?->package_index,
            'guide_number' => $package?->guide_number ?: $shipment?->display_code ?: $item->item_reference,
            'tracking_code' => $shipment?->tracking_code,
            'recipient_name' => $package?->recipient_name,
            'recipient_phone' => $package?->recipient_phone,
            'delivery_address_line1' => $package?->delivery_address_line1,
            'delivery_address_complement' => $package?->delivery_address_complement,
            'delivery_zone' => $package?->delivery_zone,
            'delivery_city' => $package?->delivery_city,
            'result' => $item->result,
            'result_label' => $this->resultLabel((string) $item->result),
            'physical_condition' => $item->physical_condition,
            'exception_code' => $item->exception_code,
            'exception_notes' => $item->exception_notes,
            'evidence' => $item->evidence->map(fn ($evidence): array => [
                'id' => $evidence->id,
                'type' => $evidence->evidence_type,
                'url' => PublicAssetUrl::toPublicUrl($evidence->original_path),
                'sha256' => $evidence->sha256,
                'source' => $evidence->source,
                'captured_at' => optional($evidence->captured_at)->toISOString(),
                'received_at' => optional($evidence->received_at)->toISOString(),
            ])->values()->all(),
            'verified_at' => optional($item->verified_at)->toISOString(),
            'verified_by' => $item->verifiedBy ? [
                'id' => $item->verifiedBy->id,
                'name' => $item->verifiedBy->name,
            ] : null,
        ];
    }

    private function statusLabel(PickupBatchStatus $status): string
    {
        return match ($status) {
            PickupBatchStatus::COMPLETED => 'Recepción completada',
            PickupBatchStatus::COMPLETED_WITH_DIFFERENCES => 'Recepción con diferencias',
            default => 'Recepción',
        };
    }

    private function resultLabel(string $result): string
    {
        return match ($result) {
            'received' => 'Recibido',
            'rejected' => 'Rechazado',
            'missing' => 'Faltante',
            default => 'Pendiente',
        };
    }
}
