<?php

namespace App\Domain\Pickup\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Operations\Enums\IntakeMode;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Pickup\Enums\CoverageStatus;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContact;
use App\Integrations\WhatsApp\Models\WhatsAppMessage;
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
        'intake_mode',
        'service_location_id',
        'planned_dropoff_at',
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
            'intake_mode' => IntakeMode::class,
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
            'planned_dropoff_at' => 'datetime',
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

    public function serviceLocation(): BelongsTo
    {
        return $this->belongsTo(ServiceLocation::class);
    }

    public function batches(): HasMany
    {
        return $this->hasMany(PickupBatch::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(OperationalTask::class);
    }

    public function reviewEvents(): HasMany
    {
        return $this->hasMany(PickupReviewEvent::class);
    }

    public function whatsappMessages(): HasMany
    {
        return $this->hasMany(WhatsAppMessage::class, 'related_entity_id')
            ->where('related_entity_type', 'pickup_request')
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }
}
