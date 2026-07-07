<?php

namespace App\Domain\Pickup\Models;

use App\Domain\Shipment\Models\Shipment;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PickupPackage extends Model
{
    protected $fillable = [
        'pickup_request_id',
        'package_index',
        'recipient_name',
        'recipient_phone',
        'delivery_address_line1',
        'delivery_address_complement',
        'delivery_zone',
        'delivery_city',
        'delivery_lat',
        'delivery_lng',
        'delivery_geocoding_confidence',
        'is_cod',
        'requested_cod_amount',
        'is_fragile',
        'package_type',
        'size_code',
        'approx_weight_kg',
        'special_handling_notes',
        'shipment_id',
        'guide_number',
        'qr_reference',
    ];

    protected function casts(): array
    {
        return [
            'package_index' => 'integer',
            'delivery_lat' => 'float',
            'delivery_lng' => 'float',
            'delivery_geocoding_confidence' => 'float',
            'is_cod' => 'boolean',
            'requested_cod_amount' => 'integer',
            'is_fragile' => 'boolean',
            'approx_weight_kg' => 'float',
        ];
    }

    public function pickupRequest(): BelongsTo
    {
        return $this->belongsTo(PickupRequest::class);
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }
}
