<?php

namespace App\Integrations\WhatsApp\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerWhatsAppContactPermission extends Model
{
    public $timestamps = false;

    protected $table = 'customer_whatsapp_contact_permissions';

    protected $fillable = [
        'customer_whatsapp_contact_id',
        'permission',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function customerWhatsAppContact(): BelongsTo
    {
        return $this->belongsTo(CustomerWhatsAppContact::class, 'customer_whatsapp_contact_id');
    }
}
