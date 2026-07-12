<?php

namespace App\Domain\Financial\Models;

use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DriverServiceEarning extends Model
{
    protected $fillable = ['driver_id', 'shipment_id', 'operational_task_id', 'earned_date', 'amount', 'paid_amount', 'service_type', 'status', 'fully_paid_at', 'notes'];
    protected function casts(): array { return ['earned_date' => 'date', 'amount' => 'integer', 'paid_amount' => 'integer', 'fully_paid_at' => 'datetime']; }
    public function driver(): BelongsTo { return $this->belongsTo(Driver::class); }
    public function shipment(): BelongsTo { return $this->belongsTo(Shipment::class); }
    public function allocations(): HasMany { return $this->hasMany(DriverServicePaymentAllocation::class, 'earning_id'); }
    public function outstanding(): int { return max(0, (int) $this->amount - (int) $this->paid_amount); }
}
