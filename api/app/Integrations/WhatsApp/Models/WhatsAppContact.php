<?php

namespace App\Integrations\WhatsApp\Models;

use App\Integrations\WhatsApp\Enums\WhatsAppContactVerificationStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WhatsAppContact extends Model
{
    protected $fillable = [
        'wa_id',
        'phone',
        'display_name',
        'verification_status',
        'last_verified_at',
        'blocked_at',
    ];

    protected function casts(): array
    {
        return [
            'verification_status' => WhatsAppContactVerificationStatus::class,
            'last_verified_at' => 'datetime',
            'blocked_at' => 'datetime',
        ];
    }

    public function customerLinks(): HasMany
    {
        return $this->hasMany(CustomerWhatsAppContact::class);
    }

    public function webhookMessages(): HasMany
    {
        return $this->hasMany(WhatsAppMessage::class);
    }
}
