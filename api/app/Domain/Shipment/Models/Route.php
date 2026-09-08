<?php

namespace App\Domain\Shipment\Models;

use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Observers\RouteNotificationObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

use Illuminate\Support\Facades\Schema;

#[ObservedBy(RouteNotificationObserver::class)]
class Route extends Model
{
    protected $fillable = [
        'driver_id', 'route_date', 'zone', 'status',
        'total_stops', 'completed_stops',
        'optimized_distance_meters', 'optimized_duration_seconds',
        'remaining_distance_meters', 'remaining_duration_seconds',
        'optimization_source', 'optimized_at',
        'origin_lat', 'origin_lng',
        'overview_polyline', 'route_legs',
    ];

    protected $casts = [
        'route_date' => 'date',
        'optimized_at' => 'datetime',
        'origin_lat' => 'float',
        'origin_lng' => 'float',
        'route_legs' => 'array',
    ];

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function stops(): HasMany
    {
        return $this->hasMany(RouteStop::class)->orderBy('sort_order');
    }

    public function taskStops(): HasMany
    {
        return $this->hasMany(RouteTaskStop::class)->orderBy('sort_order');
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
     * Sincroniza los conteos de paradas (entregas y tareas de operación) y auto-completa si corresponde.
     */
    public function syncStopsCounts(): void
    {
        $hasTaskStopsTable = Schema::hasTable('route_task_stops');
        $deliveryTotal = $this->stops()->count();
        $taskTotal = $hasTaskStopsTable ? $this->taskStops()->count() : 0;
        $totalStops = $deliveryTotal + $taskTotal;

        $deliveryCompleted = $this->stops()->where('status', 'completed')->count();
        $taskCompleted = $hasTaskStopsTable ? $this->taskStops()->where('status', 'completed')->count() : 0;
        $completedStops = $deliveryCompleted + $taskCompleted;

        $this->update([
            'total_stops' => $totalStops,
            'completed_stops' => $completedStops,
        ]);

        // Auto-completar ruta si todas las paradas (entregas y tareas) están hechas
        if ($totalStops > 0 && $completedStops >= $totalStops && in_array($this->status, ['planned', 'active'], true)) {
            $this->update(['status' => 'completed']);
        }
    }

    /**
     * Completar una parada y actualizar conteo.
     */
    public function completeStop(RouteStop $stop): void
    {
        $stop->update(['status' => 'completed']);
        $this->syncStopsCounts();
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
