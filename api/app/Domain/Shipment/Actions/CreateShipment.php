<?php

namespace App\Domain\Shipment\Actions;

use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Models\ShipmentEvent;
use App\Domain\Shipment\Services\TrackingCodeGenerator;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class CreateShipment
{
    public function __construct(
        private TrackingCodeGenerator $codeGenerator,
    ) {}

    /**
     * Crea un nuevo envío con guía automática y evento inicial.
     */
    public function execute(array $data, User $createdBy): Shipment
    {
        return DB::transaction(function () use ($data, $createdBy) {
            $codes = $this->codeGenerator->generate();

            $shipment = Shipment::create([
                ...$data,
                'tracking_code' => $codes['tracking_code'],
                'display_code' => $codes['display_code'],
                'sequence_number' => $codes['sequence_number'],
                'created_by' => $createdBy->id,
                'status' => 'registered',
                'financial_status' => 'pending',
            ]);

            // Evento de creación
            ShipmentEvent::create([
                'shipment_id' => $shipment->id,
                'user_id' => $createdBy->id,
                'from_status' => null,
                'to_status' => 'registered',
                'description' => "Envío {$codes['display_code']} creado",
                'occurred_at' => now(),
            ]);

            return $shipment->load(['client', 'driver', 'events']);
        });
    }
}
