<?php

namespace App\Integrations\WhatsApp\Models;

use App\Domain\Client\Models\Client;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsAppMessage extends Model
{
    protected $table = 'whatsapp_messages';

    protected $fillable = [
        'whatsapp_contact_id',
        'customer_id',
        'direction',
        'provider_message_id',
        'message_type',
        'message_status',
        'related_entity_type',
        'related_entity_id',
        'correlation_id',
        'payload_json',
        'sent_at',
        'received_at',
    ];

    protected function casts(): array
    {
        return [
            'payload_json' => 'array',
            'sent_at' => 'datetime',
            'received_at' => 'datetime',
        ];
    }

    public function whatsappContact(): BelongsTo
    {
        return $this->belongsTo(WhatsAppContact::class, 'whatsapp_contact_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'customer_id');
    }
}
