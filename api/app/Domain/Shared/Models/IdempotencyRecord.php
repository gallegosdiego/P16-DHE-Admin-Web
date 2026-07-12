<?php

namespace App\Domain\Shared\Models;

use Illuminate\Database\Eloquent\Model;

class IdempotencyRecord extends Model
{
    protected $fillable = [
        'scope', 'idempotency_key', 'operation', 'request_hash', 'status',
        'result_type', 'result_id', 'response_json', 'completed_at', 'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'response_json' => 'array',
            'completed_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }
}
