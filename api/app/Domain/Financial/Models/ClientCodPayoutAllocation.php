<?php

namespace App\Domain\Financial\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientCodPayoutAllocation extends Model
{
    protected $fillable = ['payout_id', 'entitlement_id', 'amount'];
    protected function casts(): array { return ['amount' => 'integer']; }
    public function payout(): BelongsTo { return $this->belongsTo(ClientCodPayout::class, 'payout_id'); }
    public function entitlement(): BelongsTo { return $this->belongsTo(ClientCodEntitlement::class, 'entitlement_id'); }
}
