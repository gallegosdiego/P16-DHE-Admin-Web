<?php

namespace App\Domain\Operations\Services;

use App\Domain\Operations\Enums\AssigneeType;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Enums\OperationalTaskType;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ReturnTaskService
{
    /** @param array<string, mixed> $attributes */
    public function create(Shipment $shipment, User $actor, array $attributes): OperationalTask
    {
        $type = OperationalTaskType::from($attributes['return_type']);
        if (! in_array($type, [OperationalTaskType::RETURN_TO_HUB, OperationalTaskType::RETURN_TO_CLIENT], true)) {
            throw ValidationException::withMessages(['return_type' => 'El tipo de devolución no es válido.']);
        }
        if ($type === OperationalTaskType::RETURN_TO_HUB && empty($attributes['service_location_id'])) {
            throw ValidationException::withMessages(['service_location_id' => 'La devolución a sede requiere una sede de destino.']);
        }
        if (OperationalTask::query()->where('shipment_id', $shipment->id)->whereIn('task_type', ['return_to_hub', 'return_to_client'])->whereIn('status', ['pending', 'assigned', 'accepted', 'in_progress'])->exists()) {
            throw ValidationException::withMessages(['shipment_id' => 'La guía ya tiene una devolución activa.']);
        }

        $driverId = $attributes['assigned_driver_id'] ?? $shipment->driver_id;
        $task = OperationalTask::create([
            'task_code' => 'RET-'.now()->format('ymd').'-'.Str::upper(Str::random(6)),
            'task_type' => $type,
            'status' => $driverId ? OperationalTaskStatus::ASSIGNED : OperationalTaskStatus::PENDING,
            'customer_id' => $shipment->client_id,
            'shipment_id' => $shipment->id,
            'service_location_id' => $attributes['service_location_id'] ?? null,
            'assignee_type' => $driverId ? AssigneeType::DANHEI_DRIVER : null,
            'assigned_driver_id' => $driverId,
            'assigned_at' => $driverId ? now() : null,
            'scheduled_date' => $attributes['scheduled_date'] ?? now()->toDateString(),
            'outcome_code' => $attributes['reason_code'],
            'notes' => $attributes['notes'] ?? null,
            'created_by' => $actor->id,
            'updated_by' => $actor->id,
            'metadata_json' => ['return_reason_code' => $attributes['reason_code']],
        ]);

        AuditLog::log('operations.return_task_created', $task, null, $task->only(['task_code', 'task_type', 'shipment_id', 'assigned_driver_id']), 'Tarea de devolución creada.');
        return $task;
    }
}
