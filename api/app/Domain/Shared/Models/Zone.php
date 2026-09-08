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

    /**
     * Determina si la zona tiene definidas sus coordenadas de caja delimitadora.
     */
    public function hasBounds(): bool
    {
        return is_numeric($this->lat_min)
            && is_numeric($this->lat_max)
            && is_numeric($this->lng_min)
            && is_numeric($this->lng_max);
    }

    /**
     * Verifica si unas coordenadas dadas caen dentro de la caja de esta zona.
     * Retorna:
     * - true si caen dentro.
     * - false si caen fuera.
     * - null si las coordenadas son inválidas o la zona no tiene bounds configurados.
     */
    public function containsCoordinates(?float $lat, ?float $lng): ?bool
    {
        if ($lat === null || $lng === null || ! $this->hasBounds()) {
            return null;
        }

        return $lat >= (float) $this->lat_min
            && $lat <= (float) $this->lat_max
            && $lng >= (float) $this->lng_min
            && $lng <= (float) $this->lng_max;
    }

    /**
     * Retorna el punto centroide estimado de la caja delimitadora.
     *
     * @return array{lat: float, lng: float}|null
     */
    public function centroid(): ?array
    {
        if (! $this->hasBounds()) {
            return null;
        }

        return [
            'lat' => round((((float) $this->lat_min) + ((float) $this->lat_max)) / 2, 7),
            'lng' => round((((float) $this->lng_min) + ((float) $this->lng_max)) / 2, 7),
        ];
    }
}
