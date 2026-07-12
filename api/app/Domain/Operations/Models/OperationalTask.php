<?php

namespace App\Domain\Operations\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Operations\Enums\AssigneeType;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Enums\OperationalTaskType;
use App\Domain\Pickup\Models\PickupBatch;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Models\RouteTaskStop;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class OperationalTask extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'task_code', 'task_type', 'status', 'priority', 'customer_id',
        'pickup_request_id', 'shipment_id', 'service_location_id', 'assignee_type',
        'assigned_driver_id', 'assigned_executor_name', 'assigned_executor_phone',
        'scheduled_date', 'window_starts_at', 'window_ends_at', 'assigned_at',
        'accepted_at', 'started_at', 'completed_at', 'cancelled_at', 'outcome_code',
        'notes', 'metadata_json', 'created_by', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'task_type' => OperationalTaskType::class,
            'status' => OperationalTaskStatus::class,
            'assignee_type' => AssigneeType::class,
            'priority' => 'integer',
            'scheduled_date' => 'date',
            'window_starts_at' => 'datetime',
            'window_ends_at' => 'datetime',
            'assigned_at' => 'datetime',
            'accepted_at' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'metadata_json' => 'array',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'customer_id');
    }

    public function pickupRequest(): BelongsTo
    {
        return $this->belongsTo(PickupRequest::class);
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function serviceLocation(): BelongsTo
    {
        return $this->belongsTo(ServiceLocation::class);
    }

    public function assignedDriver(): BelongsTo
    {
        return $this->belongsTo(Driver::class, 'assigned_driver_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function pickupBatches(): HasMany
    {
        return $this->hasMany(PickupBatch::class);
    }

    public function routeStop(): HasOne
    {
        return $this->hasOne(RouteTaskStop::class);
    }
}
