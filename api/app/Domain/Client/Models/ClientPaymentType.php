<?php

namespace App\Domain\Client\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientPaymentType extends Model
{
    protected $fillable = [
        'client_id',
        'payment_type',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }
}
