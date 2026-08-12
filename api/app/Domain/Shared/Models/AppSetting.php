<?php

namespace App\Domain\Shared\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Valor de configuración administrable desde el panel.
 *
 * `value` se cifra en reposo con APP_KEY. Como APP_KEY vive en `.env` y no en
 * la base, un volcado robado no revela credenciales por sí solo — pero perder
 * APP_KEY es perder todos los valores guardados aquí.
 */
class AppSetting extends Model
{
    protected $fillable = ['key', 'value', 'updated_by', 'last_rotated_at'];

    protected $casts = [
        'value' => 'encrypted',
        'last_rotated_at' => 'datetime',
    ];

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
