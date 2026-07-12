<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CustodyRecorder
{
    /** @param array<string, mixed> $attributes */
    public function record(Shipment $shipment, array $attributes): CustodyEvent
    {
        return DB::transaction(function () use ($shipment, $attributes) {
            Shipment::query()->lockForUpdate()->findOrFail($shipment->getKey());
            $previous = CustodyEvent::query()
                ->where('shipment_id', $shipment->getKey())
                ->latest('occurred_at')
                ->latest('id')
                ->first();

            if ($previous !== null && array_key_exists('previous_custodian_type', $attributes)) {
                $matches = $previous->new_custodian_type === $attributes['previous_custodian_type']
                    && (string) $previous->new_custodian_id === (string) ($attributes['previous_custodian_id'] ?? '');

                if (! $matches) {
                    throw ValidationException::withMessages([
                        'previous_custodian_type' => 'El custodio anterior no coincide con el último evento registrado.',
                    ]);
                }
            }

            $event = CustodyEvent::query()->create(array_merge([
                'shipment_id' => $shipment->getKey(),
                'previous_custodian_type' => $previous?->new_custodian_type,
                'previous_custodian_id' => $previous?->new_custodian_id,
                'previous_custodian_name' => $previous?->new_custodian_name,
                'occurred_at' => now(),
            ], $attributes));

            AuditLog::log(
                'operations.custody_recorded',
                $event,
                null,
                $event->only([
                    'shipment_id', 'event_type', 'previous_custodian_type',
                    'previous_custodian_id', 'new_custodian_type', 'new_custodian_id',
                ]),
                'Transferencia de custodia registrada.',
            );

            return $event;
        });
    }
}
