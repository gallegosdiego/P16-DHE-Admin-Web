<?php

namespace App\Domain\Driver\Models;

use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Driver extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'user_id',
        'name',
        'initials',
        'phone',
        'vehicle',
        'plate',
        'zone',
        'driver_license_photo',
        'driver_license_expires_at',
        'vehicle_registration_photo',
        'soat_photo',
        'soat_expires_at',
        'technical_inspection_photo',
        'technical_inspection_expires_at',
        'national_id_front_photo',
        'national_id_back_photo',
        'last_lat',
        'last_lng',
        'last_heading',
        'last_speed',
        'last_location_updated_at',
        'status',
        'efficiency',
        'daily_rate',
        'per_package_rate',
    ];

    protected function casts(): array
    {
        return [
            'efficiency' => 'integer',
            'daily_rate' => 'integer',
            'per_package_rate' => 'integer',
            'driver_license_expires_at' => 'date',
            'soat_expires_at' => 'date',
            'technical_inspection_expires_at' => 'date',
            'last_lat' => 'float',
            'last_lng' => 'float',
            'last_heading' => 'float',
            'last_speed' => 'float',
            'last_location_updated_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function shipments(): HasMany
    {
        return $this->hasMany(Shipment::class);
    }

    /**
     * Envíos asignados activos (no entregados ni terminales).
     */
    public function activeShipments(): HasMany
    {
        return $this->shipments()
            ->whereNotIn('status', ['delivered', 'returned', 'cancelled']);
    }

    /**
     * Total de contra entrega pendiente de liquidar.
     */
    public function pendingCashCollection(): int
    {
        return (int) $this->shipments()
            ->where('payment_type', 'cash_on_delivery')
            ->whereIn('financial_status', ['pending', 'collected'])
            ->sum('cod_amount');
    }
}
