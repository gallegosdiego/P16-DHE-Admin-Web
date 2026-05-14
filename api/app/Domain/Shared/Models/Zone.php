<?php

namespace App\Domain\Shared\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Zone extends Model
{
    protected $fillable = [
        'name', 'slug', 'city', 'type', 'is_active', 'sort_order',
        'description', 'lat_min', 'lat_max', 'lng_min', 'lng_max',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'lat_min' => 'float',
        'lat_max' => 'float',
        'lng_min' => 'float',
        'lng_max' => 'float',
    ];

    protected static function booted(): void
    {
        static::creating(function (Zone $zone) {
            if (empty($zone->slug)) {
                $zone->slug = Str::slug($zone->name);
            }
        });
    }

    public function pricingRules(): HasMany
    {
        return $this->hasMany(PricingRule::class);
    }

    /**
     * Obtener la tarifa activa para esta zona.
     */
    public function activeRule(): ?PricingRule
    {
        return $this->pricingRules()
            ->where('is_active', true)
            ->orderByDesc('priority')
            ->first();
    }

    /**
     * Calcular tarifa para un envío en esta zona.
     */
    public function calculatePrice(float $weightKg = 0, float $distanceKm = 0): int
    {
        $rule = $this->activeRule();
        if (! $rule) {
            return 10000; // Tarifa mínima por defecto
        }

        return $rule->calculate($weightKg, $distanceKm);
    }

    /**
     * Scope: solo zonas activas.
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
