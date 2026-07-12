<?php

namespace App\Domain\Pickup\Models;

use App\Domain\Driver\Models\Driver;
use App\Domain\Operations\Enums\AssigneeType;
use App\Domain\Operations\Enums\IntakeMode;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Pickup\Enums\PickupBatchStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PickupBatch extends Model
{
    protected $fillable = [
        'batch_code', 'pickup_request_id', 'operational_task_id', 'service_location_id',
        'driver_id', 'intake_mode', 'status', 'executor_type', 'executor_name',
        'delivered_by_name', 'delivered_by_phone', 'delivered_by_relationship',
        'received_by', 'expected_packages', 'received_packages', 'rejected_packages',
        'missing_packages', 'arrival_lat', 'arrival_lng', 'arrived_at', 'completed_at',
        'confirmation_type', 'confirmation_reference', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'intake_mode' => IntakeMode::class,
            'status' => PickupBatchStatus::class,
            'executor_type' => AssigneeType::class,
            'expected_packages' => 'integer',
            'received_packages' => 'integer',
            'rejected_packages' => 'integer',
            'missing_packages' => 'integer',
            'arrival_lat' => 'float',
            'arrival_lng' => 'float',
            'arrived_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function pickupRequest(): BelongsTo
    {
        return $this->belongsTo(PickupRequest::class);
    }

    public function operationalTask(): BelongsTo
    {
        return $this->belongsTo(OperationalTask::class);
    }

    public function serviceLocation(): BelongsTo
    {
        return $this->belongsTo(ServiceLocation::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PickupBatchItem::class);
    }
}
