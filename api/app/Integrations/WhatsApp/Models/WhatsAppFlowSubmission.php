<?php

namespace App\Integrations\WhatsApp\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Pickup\Models\PickupRequest;
use App\Integrations\WhatsApp\Enums\WhatsAppFlowSubmissionStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsAppFlowSubmission extends Model
{
    protected $table = 'whatsapp_flow_submissions';

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
            'status' => WhatsAppFlowSubmissionStatus::class,
            'payload_json' => 'array',
            'processed_at' => 'datetime',
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

    public function pickupRequest(): BelongsTo
    {
        return $this->belongsTo(PickupRequest::class);
    }
}
