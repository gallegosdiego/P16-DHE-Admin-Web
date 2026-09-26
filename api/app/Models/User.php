<?php

namespace App\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

#[Fillable(['name', 'email', 'password', 'phone', 'client_id', 'driver_id'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasRoles, Notifiable, SoftDeletes;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'purged_at' => 'datetime',
            'active' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    /**
     * Cuenta del portal de clientes: rol `client` y vinculada a una empresa.
     */
    public function isPortalClient(): bool
    {
        return $this->client_id !== null
            && $this->hasPortalClientRoleOnly();
    }

    /**
     * Tiene el rol `client` y ningún rol del equipo. Un usuario del equipo que por
     * datos antiguos tenga también `client` conserva su acceso completo.
     */
    public function hasPortalClientRoleOnly(): bool
    {
        $roles = ($this->relationLoaded('roles') ? $this->roles->pluck('name') : $this->roles()->pluck('name'))
            ->unique()
            ->all();

        return in_array('client', $roles, true)
            && array_intersect($roles, ['superadmin', 'admin', 'administrador', 'operador', 'driver']) === [];
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }
}
