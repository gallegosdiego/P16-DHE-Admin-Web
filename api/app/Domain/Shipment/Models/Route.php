<?php

namespace App\Domain\Shipment\Models;

use App\Domain\Driver\Models\Driver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Route extends Model
{
    protected $fillable = [
        'driver_id', 'route_date', 'zone', 'status',
        'total_stops', 'completed_stops',
    ];

    protected $casts = [
        'route_date' => 'date',
    ];

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function stops(): HasMany
    {
        return $this->hasMany(RouteStop::class)->orderBy('sort_order');
    }

    /**
     * Porcentaje de progreso de la ruta.
     */
    public function progress(): int
    {
        if ($this->total_stops === 0) return 0;
        return (int) round(($this->completed_stops / $this->total_stops) * 100);
    }

    /**
     * Completar una parada y actualizar conteo.
     */
    public function completeStop(RouteStop $stop): void
    {
        $stop->update(['status' => 'completed']);
        $this->increment('completed_stops');

        // Auto-completar ruta si todas las paradas están hechas
        if ($this->completed_stops >= $this->total_stops) {
            $this->update(['status' => 'completed']);
        }
    }

    public function scopeForDate($query, string $date)
    {
        return $query->where('route_date', $date);
    }

    public function scopeActive($query)
    {
        return $query->whereIn('status', ['planned', 'active']);
    }
}
