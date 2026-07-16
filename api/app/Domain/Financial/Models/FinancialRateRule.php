<?php

namespace App\Domain\Financial\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shared\Models\Zone;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinancialRateRule extends Model
{
    protected $fillable = [
        'rule_key',
        'version',
        'supersedes_rule_id',
        'name',
        'service_type',
        'scope_type',
        'driver_id',
        'client_id',
        'zone_id',
        'amount',
        'currency',
        'effective_from',
        'effective_to',
        'priority',
        'is_active',
        'change_reason',
        'created_by',
        'approved_by',
        'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'amount' => 'integer',
            'effective_from' => 'date',
            'effective_to' => 'date',
            'priority' => 'integer',
            'is_active' => 'boolean',
            'approved_at' => 'datetime',
        ];
    }

    public function supersedes(): BelongsTo
    {
        return $this->belongsTo(self::class, 'supersedes_rule_id');
    }

    public function versions(): HasMany
    {
        return $this->hasMany(self::class, 'rule_key', 'rule_key');
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function zone(): BelongsTo
    {
        return $this->belongsTo(Zone::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function earnings(): HasMany
    {
        return $this->hasMany(DriverServiceEarning::class, 'rate_rule_id');
    }
}
