<?php

namespace App\Domain\Financial\Models;

use App\Domain\Client\Models\Client;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ClientCodPayout extends Model
{
    protected $fillable = [
        'reference', 'client_id', 'paid_by', 'approved_by', 'amount', 'allocated_amount',
        'balance_before', 'balance_after', 'movement_type', 'status', 'reversal_of_id',
        'method', 'external_reference', 'paid_at', 'approved_at', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'allocated_amount' => 'integer',
            'balance_before' => 'integer',
            'balance_after' => 'integer',
            'paid_at' => 'datetime',
            'approved_at' => 'datetime',
        ];
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function paidBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'paid_by');
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
        return $this->hasMany(ClientCodPayoutAllocation::class, 'payout_id');
    }
}
