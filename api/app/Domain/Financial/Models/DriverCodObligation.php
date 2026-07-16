<?php

namespace App\Domain\Financial\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DriverCodObligation extends Model
{
    protected $fillable = ['driver_id', 'client_id', 'shipment_id', 'delivery_attempt_id', 'opening_entry_id', 'collection_date', 'expected_amount', 'collected_amount', 'remitted_amount', 'payment_method', 'status', 'reported_at', 'fully_remitted_at', 'notes'];

    protected function casts(): array
    {
        return ['collection_date' => 'date', 'expected_amount' => 'integer', 'collected_amount' => 'integer', 'remitted_amount' => 'integer', 'reported_at' => 'datetime', 'fully_remitted_at' => 'datetime'];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function openingEntry(): BelongsTo
    {
        return $this->belongsTo(FinancialOpeningEntry::class, 'opening_entry_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(DriverCodRemittanceAllocation::class, 'obligation_id');
    }

    public function outstanding(): int
    {
        return max(0, (int) $this->collected_amount - (int) $this->remitted_amount);
    }
}
