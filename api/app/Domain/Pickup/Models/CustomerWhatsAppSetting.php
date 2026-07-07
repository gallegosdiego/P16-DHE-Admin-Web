<?php

namespace App\Domain\Pickup\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Client\Models\ClientAddress;
use App\Domain\Pickup\Enums\CustomerWhatsAppStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerWhatsAppSetting extends Model
{
    protected $fillable = [
        'customer_id',
        'status',
        'cod_enabled',
        'automatic_package_limit',
        'manual_review_package_limit',
        'automatic_cod_limit',
        'manual_review_cod_limit',
        'automatic_cod_total_limit',
        'allowed_windows_json',
        'default_pickup_address_id',
        'activated_at',
        'activated_by',
        'suspended_at',
        'suspended_by',
        'suspension_reason',
    ];

    protected function casts(): array
    {
        return [
            'status' => CustomerWhatsAppStatus::class,
            'cod_enabled' => 'boolean',
            'automatic_package_limit' => 'integer',
            'manual_review_package_limit' => 'integer',
            'automatic_cod_limit' => 'integer',
            'manual_review_cod_limit' => 'integer',
            'automatic_cod_total_limit' => 'integer',
            'allowed_windows_json' => 'array',
            'activated_at' => 'datetime',
            'suspended_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'customer_id');
    }

    public function defaultPickupAddress(): BelongsTo
    {
        return $this->belongsTo(ClientAddress::class, 'default_pickup_address_id');
    }

    public function activatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'activated_by');
    }

    public function suspendedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'suspended_by');
    }
}
