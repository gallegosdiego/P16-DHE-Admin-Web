<?php

namespace App\Domain\Shared\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Un incidente de la API, tal como se registró en el momento de ocurrir.
 */
class ErrorEvent extends Model
{
    protected $fillable = [
        'error_id', 'status', 'method', 'path', 'route', 'user_id',
        'exception_class', 'message', 'file', 'line', 'trace', 'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
            'line' => 'integer',
            'status' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Nombre corto de la excepción, sin el espacio de nombres.
     * `Illuminate\Database\QueryException` → `QueryException`.
     */
    public function shortExceptionName(): string
    {
        $parts = explode('\\', $this->exception_class);

        return end($parts) ?: $this->exception_class;
    }
}
