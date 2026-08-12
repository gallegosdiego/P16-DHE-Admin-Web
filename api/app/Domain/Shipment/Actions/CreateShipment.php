<?php

namespace App\Domain\Shipment\Actions;

use App\Domain\Client\Models\Client;
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
            $data = $this->withClientContactSnapshot($data);

            $shipment = Shipment::create([
                ...$data,
                'tracking_code' => $codes['tracking_code'],
                'display_code' => $codes['display_code'],
                'sequence_number' => $codes['sequence_number'],
                'public_token' => $codes['public_token'],
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

    /**
     * Conserva en la guía la información que se usó en el momento del ingreso.
     * El remitente puede ser distinto del contacto de cobro, por eso solo se
     * completa automáticamente cuando el formulario no envió un valor.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function withClientContactSnapshot(array $data): array
    {
        $clientId = (int) ($data['client_id'] ?? 0);
        if ($clientId < 1) {
            return $data;
        }

        $client = Client::withTrashed()->find($clientId);
        if ($client === null) {
            return $data;
        }

        foreach ([
            'sender_name' => $client->name,
            'sender_phone' => $client->phone,
            'sender_email' => $client->email,
            'sender_company' => $client->company,
        ] as $field => $fallback) {
            if (blank($data[$field] ?? null) && filled($fallback)) {
                $data[$field] = $fallback;
            }
        }

        return $data;
    }
}
