<?php

namespace App\Domain\Pickup\Models;

use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PickupBatchItem extends Model
{
    protected $fillable = [
        'pickup_batch_id', 'pickup_package_id', 'shipment_id', 'item_reference',
        'result', 'physical_condition', 'exception_code', 'exception_notes',
        'verified_at', 'verified_by',
    ];

    protected function casts(): array
    {
        return ['verified_at' => 'datetime'];
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(PickupBatch::class, 'pickup_batch_id');
    }

    public function pickupPackage(): BelongsTo
    {
        return $this->belongsTo(PickupPackage::class);
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function verifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}
