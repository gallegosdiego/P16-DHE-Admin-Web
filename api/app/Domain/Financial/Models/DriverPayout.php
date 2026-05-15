<?php

namespace App\Domain\Financial\Models;

use App\Domain\Driver\Models\Driver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DriverPayout extends Model
{
    protected $fillable = [
        'driver_id',
        'payout_date',
        'packages_count',
        'total_amount',
        'paid_at',
        'status',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'payout_date' => 'date',
            'packages_count' => 'integer',
            'total_amount' => 'integer',
            'paid_at' => 'date',
        ];
    }

    // ── Relaciones ────────────────────────────────

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    // ── Scopes ────────────────────────────────────

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopePaid($query)
    {
        return $query->where('status', 'paid');
    }
}
