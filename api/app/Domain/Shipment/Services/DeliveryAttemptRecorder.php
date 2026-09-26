<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\DeliveryAttempt;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use App\Support\ShipmentEvidenceStorage;

class DeliveryAttemptRecorder
{
    /** @param array<string, mixed> $data */
    public function record(Shipment $shipment, ?RouteStop $routeStop, User $actor, ShipmentStatus $outcome, array $data = []): DeliveryAttempt
    {
        $attemptNumber = (int) DeliveryAttempt::query()->where('shipment_id', $shipment->id)->max('attempt_number') + 1;
        $isDelivered = $outcome === ShipmentStatus::DELIVERED;
        $attempt = DeliveryAttempt::create([
            'shipment_id' => $shipment->id,
            'route_stop_id' => $routeStop?->id,
            'driver_id' => $shipment->driver_id,
            'attempt_number' => $attemptNumber,
            'status' => $isDelivered ? 'delivered' : 'not_delivered',
            'result_code' => $isDelivered ? 'delivered' : 'issue_reported',
            'failure_cause_code' => $isDelivered ? null : ($data['issue_code'] ?? 'unspecified'),
            'started_at' => now(),
            'arrived_at' => now(),
            'finished_at' => now(),
            'lat' => $data['driver_lat'] ?? null,
            'lng' => $data['driver_lng'] ?? null,
            'recipient_name' => $data['evidence_receiver_name'] ?? null,
            'cod_expected_amount' => (int) ($shipment->cod_amount ?? 0),
            'cod_collected_amount' => (int) ($shipment->cod_collected_amount ?? 0),
            'cod_payment_method' => $shipment->cod_payment_method,
            'custody_outcome' => $isDelivered ? 'delivered_to_recipient' : 'retained_by_driver',
            'notes' => $data['description'] ?? $data['issue_note'] ?? null,
            'metadata_json' => ['actor_user_id' => $actor->id],
        ]);

        $this->recordEvidence($shipment, $attempt, $actor, $isDelivered, $data);

        app(CustodyRecorder::class)->record($shipment, [
            'event_type' => $isDelivered ? 'delivery_completed' : 'delivery_attempt_failed',
            'new_custodian_type' => $isDelivered ? 'recipient' : 'driver',
            'new_custodian_id' => $isDelivered ? null : $shipment->driver_id,
            'new_custodian_name' => $isDelivered ? ($data['evidence_receiver_name'] ?? $shipment->recipient_name) : $shipment->driver?->name,
            'actor_user_id' => $actor->id,
            'lat' => $data['driver_lat'] ?? null,
            'lng' => $data['driver_lng'] ?? null,
            'metadata_json' => ['delivery_attempt_id' => $attempt->id, 'outcome' => $outcome->value],
        ]);

        return $attempt;
    }

    /**
     * Cada foto recibida en ESTE intento es una fila ligada al intento nuevo.
     *
     * Antes se copiaba `shipments.evidence_photo`, que sobrevive entre
     * intentos: una novedad sin foto heredaba la foto de la entrega anterior y
     * siempre como `delivery_photo`. Ahora solo cuentan los archivos del
     * request (`$data['evidence_files']`, ya guardados por el controlador).
     *
     * @param  array<string, mixed>  $data
     */
    private function recordEvidence(Shipment $shipment, DeliveryAttempt $attempt, User $actor, bool $isDelivered, array $data): void
    {
        $files = $data['evidence_files'] ?? [];
        if (! is_array($files) || $files === []) {
            return;
        }

        app(ShipmentEvidenceStorage::class)->record(
            $shipment,
            array_values($files),
            $isDelivered ? 'delivery_photo' : 'issue_photo',
            $actor,
            $attempt->id,
            ['lat' => $data['driver_lat'] ?? null, 'lng' => $data['driver_lng'] ?? null],
        );
    }
}
