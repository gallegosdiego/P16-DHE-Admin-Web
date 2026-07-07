<?php

namespace App\Domain\Pickup\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PickupReviewEvent extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'pickup_request_id',
        'event_type',
        'reason_code',
        'notes',
        'requested_fields_json',
        'old_values_json',
        'new_values_json',
        'actor_type',
        'actor_id',
        'occurred_at',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'requested_fields_json' => 'array',
            'old_values_json' => 'array',
            'new_values_json' => 'array',
            'occurred_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function pickupRequest(): BelongsTo
    {
        return $this->belongsTo(PickupRequest::class);
    }
}
