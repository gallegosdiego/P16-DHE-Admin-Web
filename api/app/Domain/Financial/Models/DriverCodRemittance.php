<?php

namespace App\Domain\Financial\Models;

use App\Domain\Driver\Models\Driver;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DriverCodRemittance extends Model
{
    protected $fillable = ['reference', 'driver_id', 'received_by', 'amount', 'allocated_amount', 'method', 'external_reference', 'status', 'received_at', 'notes'];
    protected function casts(): array { return ['amount' => 'integer', 'allocated_amount' => 'integer', 'received_at' => 'datetime']; }
    public function driver(): BelongsTo { return $this->belongsTo(Driver::class); }
    public function receivedBy(): BelongsTo { return $this->belongsTo(User::class, 'received_by'); }
    public function allocations(): HasMany { return $this->hasMany(DriverCodRemittanceAllocation::class, 'remittance_id'); }
}
