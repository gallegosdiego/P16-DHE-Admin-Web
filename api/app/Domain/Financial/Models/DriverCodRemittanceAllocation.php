<?php

namespace App\Domain\Financial\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DriverCodRemittanceAllocation extends Model
{
    protected $fillable = ['remittance_id', 'obligation_id', 'amount'];
    protected function casts(): array { return ['amount' => 'integer']; }
    public function remittance(): BelongsTo { return $this->belongsTo(DriverCodRemittance::class, 'remittance_id'); }
    public function obligation(): BelongsTo { return $this->belongsTo(DriverCodObligation::class, 'obligation_id'); }
}
