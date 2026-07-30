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

    protected $hidden = [
        'paymentTypes',
    ];

    protected $appends = [
        'billing_types',
    ];

    protected $fillable = [
        'name',
        'phone',
        'email',
        'company',
        'company_phone',
        'nit',
        'billing_type',
        'notes',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'purged_at' => 'datetime',
        ];
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(ClientAddress::class);
    }

    public function paymentTypes(): HasMany
    {
        return $this->hasMany(ClientPaymentType::class);
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
     * Preferencias comerciales de pago. El pago real se define en cada envío.
     *
     * @return list<string>
     */
    public function getBillingTypesAttribute(): array
    {
        if ($this->relationLoaded('paymentTypes') && $this->paymentTypes->isNotEmpty()) {
            return $this->paymentTypes
                ->pluck('payment_type')
                ->values()
                ->all();
        }

        $legacyType = (string) ($this->getAttribute('billing_type') ?? '');

        return $legacyType !== '' ? [$legacyType] : [];
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
