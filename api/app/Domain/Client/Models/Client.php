<?php

namespace App\Domain\Client\Models;

use App\Domain\Pickup\Models\CustomerWhatsAppSetting;
use App\Domain\Shipment\Models\Shipment;
use App\Integrations\WhatsApp\Models\CustomerWhatsAppContact;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Client extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'phone',
        'email',
        'company',
        'nit',
        'billing_type',
        'notes',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(ClientAddress::class);
    }

    public function whatsappSettings(): HasOne
    {
        return $this->hasOne(CustomerWhatsAppSetting::class, 'customer_id');
    }

    public function whatsappContacts(): HasMany
    {
        return $this->hasMany(CustomerWhatsAppContact::class, 'customer_id');
    }

    public function shipments(): HasMany
    {
        return $this->hasMany(Shipment::class);
    }

    /**
     * Total que este cliente debe a Danhei (cuentas por cobrar).
     */
    public function totalOwed(): int
    {
        return (int) $this->shipments()
            ->where('payment_type', 'post_sale')
            ->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
            ->sum('shipping_cost');
    }
}
