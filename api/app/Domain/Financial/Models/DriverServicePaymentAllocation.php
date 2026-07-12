<?php

namespace App\Domain\Financial\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DriverServicePaymentAllocation extends Model
{
    protected $fillable = ['payment_id', 'earning_id', 'amount'];
    protected function casts(): array { return ['amount' => 'integer']; }
    public function payment(): BelongsTo { return $this->belongsTo(DriverServicePayment::class, 'payment_id'); }
    public function earning(): BelongsTo { return $this->belongsTo(DriverServiceEarning::class, 'earning_id'); }
}
