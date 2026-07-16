<?php

namespace App\Domain\Financial\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class FinancialOpeningEntry extends Model
{
    protected $fillable = [
        'reference',
        'account_type',
        'driver_id',
        'client_id',
        'amount',
        'effective_date',
        'support_reference',
        'notes',
        'created_by',
        'approved_by',
        'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'effective_date' => 'date',
            'approved_at' => 'datetime',
        ];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function codObligation(): HasOne
    {
        return $this->hasOne(DriverCodObligation::class, 'opening_entry_id');
    }

    public function serviceEarning(): HasOne
    {
        return $this->hasOne(DriverServiceEarning::class, 'opening_entry_id');
    }

    public function clientEntitlement(): HasOne
    {
        return $this->hasOne(ClientCodEntitlement::class, 'opening_entry_id');
    }
}
