<?php

namespace App\Domain\Financial\Models;

use App\Domain\Driver\Models\Driver;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DriverServicePayment extends Model
{
    protected $fillable = ['reference', 'driver_id', 'paid_by', 'amount', 'allocated_amount', 'method', 'external_reference', 'paid_at', 'notes'];
    protected function casts(): array { return ['amount' => 'integer', 'allocated_amount' => 'integer', 'paid_at' => 'datetime']; }
    public function driver(): BelongsTo { return $this->belongsTo(Driver::class); }
    public function paidBy(): BelongsTo { return $this->belongsTo(User::class, 'paid_by'); }
    public function allocations(): HasMany { return $this->hasMany(DriverServicePaymentAllocation::class, 'payment_id'); }
}
