<?php

namespace App\Domain\Pickup\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Pickup\Enums\CoverageStatus;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContact;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PickupRequest extends Model
{
    protected $fillable = [
        'pickup_code',
        'customer_id',
        'customer_whatsapp_contact_id',
        'source',
        'status',
        'review_reason_code',
        'pickup_address_line1',
        'pickup_address_complement',
        'pickup_zone',
        'pickup_city',
        'pickup_lat',
        'pickup_lng',
        'pickup_geocoding_confidence',
        'coverage_status',
        'contact_name',
        'contact_phone',
        'pickup_window_code',
        'pickup_window_label',
        'package_count',
        'requested_cod_total',
        'special_instructions',
        'correlation_id',
        'submitted_at',
        'accepted_at',
        'ready_for_assignment_at',
        'cancelled_at',
    ];

    protected function casts(): array
    {
        return [
            'status' => PickupStatus::class,
            'coverage_status' => CoverageStatus::class,
            'pickup_lat' => 'float',
            'pickup_lng' => 'float',
            'pickup_geocoding_confidence' => 'float',
            'package_count' => 'integer',
            'requested_cod_total' => 'integer',
            'submitted_at' => 'datetime',
            'accepted_at' => 'datetime',
            'ready_for_assignment_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'customer_id');
    }

    public function customerWhatsAppContact(): BelongsTo
    {
        return $this->belongsTo(CustomerWhatsAppContact::class, 'customer_whatsapp_contact_id');
    }

    public function packages(): HasMany
    {
        return $this->hasMany(PickupPackage::class);
    }

    public function reviewEvents(): HasMany
    {
        return $this->hasMany(PickupReviewEvent::class);
    }
}
