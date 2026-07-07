<?php

namespace App\Integrations\WhatsApp\Models;

use App\Domain\Client\Models\Client;
use App\Integrations\WhatsApp\Enums\CustomerWhatsAppContactStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerWhatsAppContact extends Model
{
    protected $table = 'customer_whatsapp_contacts';

    protected $fillable = [
        'customer_id',
        'whatsapp_contact_id',
        'role',
        'status',
        'authorized_at',
        'authorized_by',
        'revoked_at',
        'revoked_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => CustomerWhatsAppContactStatus::class,
            'authorized_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'customer_id');
    }

    public function whatsappContact(): BelongsTo
    {
        return $this->belongsTo(WhatsAppContact::class, 'whatsapp_contact_id');
    }

    public function permissions(): HasMany
    {
        return $this->hasMany(CustomerWhatsAppContactPermission::class, 'customer_whatsapp_contact_id');
    }

    public function authorizedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'authorized_by');
    }

    public function revokedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }

    public function isAuthorized(): bool
    {
        return $this->status === CustomerWhatsAppContactStatus::AUTHORIZED;
    }

    public function hasPermission(string $permission): bool
    {
        return $this->permissions->contains(
            fn (CustomerWhatsAppContactPermission $item): bool => $item->permission === $permission
        );
    }
}
