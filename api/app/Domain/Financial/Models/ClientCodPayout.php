<?php

namespace App\Domain\Financial\Models;

use App\Domain\Client\Models\Client;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClientCodPayout extends Model
{
    protected $fillable = ['reference', 'client_id', 'paid_by', 'amount', 'allocated_amount', 'method', 'external_reference', 'paid_at', 'notes'];
    protected function casts(): array { return ['amount' => 'integer', 'allocated_amount' => 'integer', 'paid_at' => 'datetime']; }
    public function client(): BelongsTo { return $this->belongsTo(Client::class); }
    public function paidBy(): BelongsTo { return $this->belongsTo(User::class, 'paid_by'); }
    public function allocations(): HasMany { return $this->hasMany(ClientCodPayoutAllocation::class, 'payout_id'); }
}
