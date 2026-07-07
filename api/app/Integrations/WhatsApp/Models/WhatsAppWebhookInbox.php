<?php

namespace App\Integrations\WhatsApp\Models;

use App\Integrations\WhatsApp\Enums\WebhookProcessingStatus;
use Illuminate\Database\Eloquent\Model;

class WhatsAppWebhookInbox extends Model
{
    protected $table = 'whatsapp_webhook_inbox';

    protected $fillable = [
        'provider',
        'external_event_id',
        'event_type',
        'payload_hash',
        'signature_valid',
        'processing_status',
        'received_at',
        'processed_at',
        'correlation_id',
        'payload_json',
        'headers_json',
        'error_code',
        'error_message',
    ];

    protected function casts(): array
    {
        return [
            'signature_valid' => 'boolean',
            'processing_status' => WebhookProcessingStatus::class,
            'received_at' => 'datetime',
            'processed_at' => 'datetime',
            'payload_json' => 'array',
            'headers_json' => 'array',
        ];
    }
}
