<?php

namespace App\Domain\Financial\Models;

use App\Domain\Driver\Models\Driver;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CodSettlement extends Model
{
    protected $fillable = [
        'driver_id',
        'settlement_date',
        'total_collected',
        'total_settled',
        'difference',
        'status',
        'notes',
        'settled_by',
    ];

    protected function casts(): array
    {
        return [
            'settlement_date' => 'date',
            'total_collected' => 'integer',
            'total_settled' => 'integer',
            'difference' => 'integer',
        ];
    }

    // ── Relaciones ────────────────────────────────

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function settledByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'settled_by');
    }

    // ── Scopes ────────────────────────────────────

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeSettled($query)
    {
        return $query->where('status', 'settled');
    }

    // ── Helpers ───────────────────────────────────

    /**
     * ¿El conductor entregó todo el dinero?
     */
    public function isFullySettled(): bool
    {
        return $this->difference === 0 || $this->status === 'settled';
    }
}
