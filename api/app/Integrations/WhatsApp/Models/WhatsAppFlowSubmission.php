<?php

namespace App\Integrations\WhatsApp\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Pickup\Models\PickupRequest;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsAppFlowSubmission extends Model
{
    protected $fillable = [
        'submission_id',
        'flow_id',
        'whatsapp_contact_id',
        'customer_id',
        'pickup_request_id',
        'status',
        'payload_json',
        'payload_hash',
        'processed_at',
        'correlation_id',
    ];

    protected function casts(): array
    {
        return [
            'payload_json' => 'array',
            'processed_at' => 'datetime',
        ];
    }

    public function whatsappContact(): BelongsTo
    {
        return $this->belongsTo(WhatsAppContact::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'customer_id');
    }

    public function pickupRequest(): BelongsTo
    {
        return $this->belongsTo(PickupRequest::class);
    }
}
