<?php

namespace App\Domain\Financial\Models;

use App\Domain\Driver\Models\Driver;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DriverServiceEarning extends Model
{
    protected $fillable = [
        'driver_id', 'shipment_id', 'operational_task_id', 'opening_entry_id', 'rate_rule_id',
        'earned_date', 'amount', 'standard_amount', 'rate_snapshot_json',
        'paid_amount', 'service_type', 'status', 'fully_paid_at', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'earned_date' => 'date',
            'amount' => 'integer',
            'standard_amount' => 'integer',
            'rate_snapshot_json' => 'array',
            'paid_amount' => 'integer',
            'fully_paid_at' => 'datetime',
        ];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function operationalTask(): BelongsTo
    {
        return $this->belongsTo(OperationalTask::class);
    }

    public function openingEntry(): BelongsTo
    {
        return $this->belongsTo(FinancialOpeningEntry::class, 'opening_entry_id');
    }

    public function rateRule(): BelongsTo
    {
        return $this->belongsTo(FinancialRateRule::class, 'rate_rule_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(DriverServicePaymentAllocation::class, 'earning_id');
    }

    public function outstanding(): int
    {
        return max(0, (int) $this->amount - (int) $this->paid_amount);
    }
}
