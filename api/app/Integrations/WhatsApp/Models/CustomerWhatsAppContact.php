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
        return $this->belongsTo(WhatsAppContact::class);
    }

    public function permissions(): HasMany
    {
        return $this->hasMany(CustomerWhatsAppContactPermission::class);
    }

    public function authorizedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'authorized_by');
    }

    public function revokedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }
}
