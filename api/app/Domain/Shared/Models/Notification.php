<?php

namespace App\Domain\Shared\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    protected $fillable = [
        'user_id', 'type', 'title', 'body', 'action_url', 'metadata', 'read_at',
    ];

    protected $casts = [
        'metadata' => 'array',
        'read_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * ¿Está leída?
     */
    public function isRead(): bool
    {
        return $this->read_at !== null;
    }

    /**
     * Marcar como leída.
     */
    public function markAsRead(): void
    {
        if (! $this->isRead()) {
            $this->update(['read_at' => now()]);
        }
    }

    /**
     * Crear notificación para un usuario.
     */
    public static function send(
        int $userId,
        string $type,
        string $title,
        ?string $body = null,
        ?string $actionUrl = null,
        ?array $metadata = null,
    ): self {
        return self::create([
            'user_id' => $userId,
            'type' => $type,
            'title' => $title,
            'body' => $body,
            'action_url' => $actionUrl,
            'metadata' => $metadata,
        ]);
    }

    /**
     * Notificar a todos los usuarios con un rol.
     */
    public static function sendToRole(
        string $roleName,
        string $type,
        string $title,
        ?string $body = null,
        ?string $actionUrl = null,
    ): int {
        try {
            $users = User::role($roleName)->pluck('id');
        } catch (\Spatie\Permission\Exceptions\RoleDoesNotExist $e) {
            // Role may not exist for current guard context (e.g. sanctum in API)
            // Fall back to checking the web guard
            try {
                $role = \Spatie\Permission\Models\Role::where('name', $roleName)->first();
                if (! $role) {
                    return 0;
                }
                $users = $role->users()->pluck('users.id');
            } catch (\Throwable) {
                return 0;
            }
        }
        $count = 0;

        foreach ($users as $userId) {
            self::send($userId, $type, $title, $body, $actionUrl);
            $count++;
        }

        return $count;
    }

    // Scopes
    public function scopeUnread($query)
    {
        return $query->whereNull('read_at');
    }

    public function scopeForUser($query, int $userId)
    {
        return $query->where('user_id', $userId);
    }
}
