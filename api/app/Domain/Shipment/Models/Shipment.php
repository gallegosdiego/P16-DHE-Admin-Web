<?php

namespace App\Domain\Shipment\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\CodSettlement;
use App\Domain\Financial\Models\DriverPayout;
use App\Domain\Shipment\Enums\PaymentType;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Financial\Enums\FinancialStatus;
use App\Domain\Shipment\Observers\ShipmentNotificationObserver;
use App\Models\User;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

#[ObservedBy(ShipmentNotificationObserver::class)]
class Shipment extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'tracking_code',
        'display_code',
        'sequence_number',
        'client_id',
        'driver_id',
        'created_by',
        'recipient_name',
        'recipient_phone',
        'recipient_address',
        'recipient_zone',
        'recipient_city',
        'delivery_instructions',
        'status',
        'payment_type',
        'shipping_cost',
        'cod_amount',
        'financial_status',
        'driver_paid',
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
        'picked_up_at',
        'delivered_at',
        'settlement_id',
        'payout_id',
    ];

    protected function casts(): array
    {
        return [
            'status' => ShipmentStatus::class,
            'payment_type' => PaymentType::class,
            'financial_status' => FinancialStatus::class,
            'shipping_cost' => 'integer',
            'cod_amount' => 'integer',
            'driver_fee' => 'integer',
            'outsource_amount' => 'integer',
            'driver_paid' => 'boolean',
            'is_outsourced' => 'boolean',
            'picked_up_at' => 'datetime',
            'delivered_at' => 'datetime',
        ];
    }

    // ── Relaciones ────────────────────────────────

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

    public function settlement(): BelongsTo
    {
        return $this->belongsTo(CodSettlement::class);
    }

    public function payout(): BelongsTo
    {
        return $this->belongsTo(DriverPayout::class);
    }

    // ── Scopes ────────────────────────────────────

    public function scopeOutsourced($query)
    {
        return $query->where('is_outsourced', true);
    }

    // ── Helpers ───────────────────────────────────

    /**
     * Calcula la ganancia de Danhei por este envío.
     */
    public function profit(): int
    {
        if ($this->is_outsourced) {
            return $this->outsource_amount - $this->driver_fee;
        }

        return $this->shipping_cost - $this->driver_fee;
    }

    /**
     * Verifica si se puede hacer una transición de estado.
     */
    public function canTransitionTo(ShipmentStatus $target): bool
    {
        return $this->status->canTransitionTo($target);
    }
}
