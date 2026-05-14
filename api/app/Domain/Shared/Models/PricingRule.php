<?php

namespace App\Domain\Shared\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PricingRule extends Model
{
    protected $fillable = [
        'name', 'zone_id', 'type', 'base_price', 'per_kg_price',
        'per_km_price', 'min_price', 'max_weight_kg', 'is_active',
        'priority', 'notes',
    ];

    protected $casts = [
        'base_price' => 'integer',
        'per_kg_price' => 'integer',
        'per_km_price' => 'integer',
        'min_price' => 'integer',
        'max_weight_kg' => 'float',
        'is_active' => 'boolean',
    ];

    public function zone(): BelongsTo
    {
        return $this->belongsTo(Zone::class);
    }

    /**
     * Calcular la tarifa para un envío.
     *
     * Lógica:
     * - flat: base_price fijo
     * - per_kg: base_price + (peso × per_kg_price)
     * - per_km: base_price + (distancia × per_km_price)
     * - surge: base_price × 1.5 (hora pico)
     */
    public function calculate(float $weightKg = 0, float $distanceKm = 0): int
    {
        $total = $this->base_price;

        if ($this->type === 'per_kg' && $weightKg > 0) {
            $total += (int) ($weightKg * $this->per_kg_price);
        }

        if ($this->type === 'per_km' && $distanceKm > 0) {
            $total += (int) ($distanceKm * $this->per_km_price);
        }

        if ($this->type === 'surge') {
            $total = (int) ($this->base_price * 1.5);
        }

        // Aplicar mínimo
        return max($total, $this->min_price);
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
