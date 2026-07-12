<?php

namespace App\Domain\Shipment\Models;

use App\Domain\Driver\Models\Driver;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Shipment\Enums\DeliveryAttemptStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DeliveryAttempt extends Model
{
    protected $fillable = [
        'shipment_id', 'operational_task_id', 'route_stop_id', 'driver_id',
        'attempt_number', 'status', 'result_code', 'failure_cause_code',
        'started_at', 'arrived_at', 'finished_at', 'lat', 'lng', 'recipient_name',
        'recipient_document', 'recipient_relationship', 'cod_expected_amount',
        'cod_collected_amount', 'cod_payment_method', 'custody_outcome', 'notes',
        'metadata_json',
    ];

    protected function casts(): array
    {
        return [
            'status' => DeliveryAttemptStatus::class,
            'attempt_number' => 'integer',
            'started_at' => 'datetime',
            'arrived_at' => 'datetime',
            'finished_at' => 'datetime',
            'lat' => 'float',
            'lng' => 'float',
            'cod_expected_amount' => 'integer',
            'cod_collected_amount' => 'integer',
            'metadata_json' => 'array',
        ];
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function operationalTask(): BelongsTo
    {
        return $this->belongsTo(OperationalTask::class);
    }

    public function routeStop(): BelongsTo
    {
        return $this->belongsTo(RouteStop::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function evidence(): HasMany
    {
        return $this->hasMany(ShipmentEvidence::class);
    }
}
