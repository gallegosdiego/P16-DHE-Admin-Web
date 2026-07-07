<?php

namespace App\Integrations\WhatsApp\Models;

use App\Domain\Client\Models\Client;
use App\Integrations\WhatsApp\Enums\WhatsAppLinkRequestStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsAppLinkRequest extends Model
{
    protected $fillable = [
        'whatsapp_contact_id',
        'requested_customer_id',
        'requested_company_name',
        'status',
        'requested_by_phone',
        'notes',
        'approved_by',
        'approved_at',
        'rejected_by',
        'rejected_at',
        'rejection_reason',
    ];

    protected function casts(): array
    {
        return [
            'status' => WhatsAppLinkRequestStatus::class,
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    public function whatsappContact(): BelongsTo
    {
        return $this->belongsTo(WhatsAppContact::class);
    }

    public function requestedCustomer(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'requested_customer_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function rejectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }
}
