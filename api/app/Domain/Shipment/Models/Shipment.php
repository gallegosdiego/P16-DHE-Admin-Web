<?php

namespace App\Domain\Shipment\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Enums\FinancialStatus;
use App\Domain\Financial\Models\CodSettlement;
use App\Domain\Financial\Models\DriverPayout;
use App\Domain\Shipment\Enums\PaymentType;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Observers\ShipmentNotificationObserver;
use App\Domain\Shipment\Services\GeocodingService;
use App\Domain\Shipment\Services\ShipmentGeodataService;
use App\Models\User;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Schema;

#[ObservedBy(ShipmentNotificationObserver::class)]
class Shipment extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'client_id',
        'driver_id',
        'created_by',
        'tracking_code',
        'display_code',
        'sequence_number',
        'status',
        'financial_status',
        'recipient_name',
        'recipient_phone',
        'recipient_address',
        'recipient_zone',
        'recipient_city',
        'recipient_lat',
        'recipient_lng',
        'geocoded_at',
        'delivery_instructions',
        'payment_type',
        'shipping_cost',
        'cod_amount',
        'cod_collected_amount',
        'cod_payment_method',
        'cod_collected_at',
        'driver_fee',
        'is_outsourced',
        'outsource_company',
        'outsource_amount',
        'notes',
        'issue_note',
        'evidence_photo',
        'evidence_signature',
        'evidence_receiver_name',
        'intake_photo',
        'driver_paid',
        'picked_up_at',
        'delivered_at',
    ];

    protected $hidden = [
        'settlement_id',
        'payout_id',
        'sequence_number',
        'created_by',
        'driver_paid',
    ];

    protected $appends = [
        'has_coordinates',
        'geocoding_pending',
    ];

    protected function casts(): array
    {
        return [
            'status' => ShipmentStatus::class,
            'payment_type' => PaymentType::class,
            'financial_status' => FinancialStatus::class,
            'shipping_cost' => 'integer',
            'cod_amount' => 'integer',
            'cod_collected_amount' => 'integer',
            'cod_collected_at' => 'datetime',
            'driver_fee' => 'integer',
            'outsource_amount' => 'integer',
            'driver_paid' => 'boolean',
            'is_outsourced' => 'boolean',
            'picked_up_at' => 'datetime',
            'delivered_at' => 'datetime',
            'recipient_lat' => 'float',
            'recipient_lng' => 'float',
            'geocoded_at' => 'datetime',
        ];
    }

    public static function supportsCodCollectionFields(): bool
    {
        return Schema::hasColumn('shipments', 'cod_collected_amount')
            && Schema::hasColumn('shipments', 'cod_payment_method')
            && Schema::hasColumn('shipments', 'cod_collected_at');
    }

    protected static function booted(): void
    {
        static::saving(function (Shipment $shipment) {
            app(ShipmentGeodataService::class)->repair($shipment);
        });
    }

    public function hasRecipientCoordinates(): bool
    {
        return is_numeric($this->recipient_lat) && is_numeric($this->recipient_lng);
    }

    public function hasValidManualCoordinates(): bool
    {
        return ($this->isDirty('recipient_lat') || $this->isDirty('recipient_lng'))
            && $this->hasRecipientCoordinates();
    }

    public function shouldAttemptGeocoding(): bool
    {
        if (! $this->recipient_address || ! $this->recipient_city) {
            return false;
        }

        return ! $this->hasRecipientCoordinates()
            || $this->isDirty('recipient_address')
            || $this->isDirty('recipient_city');
    }

    public function attemptGeocoding(): bool
    {
        if (! $this->recipient_address || ! $this->recipient_city) {
            return false;
        }

        $coords = app(GeocodingService::class)->geocode(
            $this->recipient_address,
            $this->recipient_city,
        );

        if (! $coords) {
            return false;
        }

        $this->recipient_lat = $coords['lat'];
        $this->recipient_lng = $coords['lng'];
        $this->geocoded_at = now();

        return true;
    }

    public function coordinatesMissing(): bool
    {
        return ! $this->hasRecipientCoordinates();
    }

    public function geocodingEligible(): bool
    {
        return filled($this->recipient_address) && filled($this->recipient_city);
    }

    public function geocodingPending(): bool
    {
        return $this->coordinatesMissing() && $this->geocodingEligible();
    }

    public function scopeWithCoordinates($query)
    {
        return $query->whereNotNull('recipient_lat')->whereNotNull('recipient_lng');
    }

    public function scopeWithoutCoordinates($query)
    {
        return $query->where(function ($subQuery) {
            $subQuery->whereNull('recipient_lat')->orWhereNull('recipient_lng');
        });
    }

    public function scopePendingGeocoding($query)
    {
        return $query
            ->withoutCoordinates()
            ->whereNotNull('recipient_address')
            ->where('recipient_address', '!=', '')
            ->whereNotNull('recipient_city')
            ->where('recipient_city', '!=', '');
    }

    public function getHasCoordinatesAttribute(): bool
    {
        return $this->hasRecipientCoordinates();
    }

    public function getGeocodingPendingAttribute(): bool
    {
        return $this->geocodingPending();
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function events(): HasMany
    {
        return $this->hasMany(ShipmentEvent::class)->orderByDesc('occurred_at');
    }

    public function routeStops(): HasMany
    {
        return $this->hasMany(RouteStop::class);
    }

    public function settlement(): BelongsTo
    {
        return $this->belongsTo(CodSettlement::class);
    }

    public function payout(): BelongsTo
    {
        return $this->belongsTo(DriverPayout::class);
    }

    public function scopeOutsourced($query)
    {
        return $query->where('is_outsourced', true);
    }

    public function profit(): int
    {
        if ($this->is_outsourced) {
            return $this->outsource_amount - $this->driver_fee;
        }

        return $this->shipping_cost - $this->driver_fee;
    }

    public function canTransitionTo(ShipmentStatus $target): bool
    {
        return $this->status->canTransitionTo($target);
    }
}
