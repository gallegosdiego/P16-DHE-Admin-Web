<?php

namespace App\Domain\Financial\Models;

use App\Domain\Driver\Models\Driver;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class DriverCodRemittance extends Model
{
    protected $fillable = [
        'reference', 'driver_id', 'received_by', 'approved_by', 'amount', 'allocated_amount',
        'balance_before', 'balance_after', 'movement_type', 'reversal_of_id', 'method',
        'external_reference', 'status', 'received_at', 'approved_at', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'allocated_amount' => 'integer',
            'balance_before' => 'integer',
            'balance_after' => 'integer',
            'received_at' => 'datetime',
            'approved_at' => 'datetime',
        ];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function reversalOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reversal_of_id');
    }

    public function reversal(): HasOne
    {
        return $this->hasOne(self::class, 'reversal_of_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(DriverCodRemittanceAllocation::class, 'remittance_id');
    }
}
