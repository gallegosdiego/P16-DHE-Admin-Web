<?php

namespace App\Domain\Operations\Services;

use App\Domain\Financial\Services\ReconciliationLedgerService;
use App\Domain\Operations\Enums\IntakeMode;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Enums\OperationalTaskType;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Shared\Models\AuditLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OperationalTaskService
{
    public function __construct(
        private readonly ReconciliationLedgerService $reconciliationLedger,
    ) {}

    /** @param array<string, mixed> $attributes */
    public function createForPickupRequest(PickupRequest $pickupRequest, array $attributes = []): OperationalTask
    {
        return DB::transaction(function () use ($pickupRequest, $attributes) {
            $pickupRequest = PickupRequest::query()->lockForUpdate()->findOrFail($pickupRequest->getKey());
            $intakeMode = $pickupRequest->intake_mode instanceof IntakeMode
                ? $pickupRequest->intake_mode
                : IntakeMode::from((string) $pickupRequest->intake_mode);

            if ($intakeMode->requiresServiceLocation() && ! $pickupRequest->service_location_id) {
                throw ValidationException::withMessages([
                    'service_location_id' => 'La recepción en sede requiere una ubicación de servicio.',
                ]);
            }

            $hasActiveTask = OperationalTask::query()
                ->where('pickup_request_id', $pickupRequest->getKey())
                ->whereNotIn('status', array_map(
                    fn (OperationalTaskStatus $status) => $status->value,
                    [
                        OperationalTaskStatus::COMPLETED,
                        OperationalTaskStatus::PARTIALLY_COMPLETED,
                        OperationalTaskStatus::REJECTED,
                        OperationalTaskStatus::FAILED,
                        OperationalTaskStatus::CANCELLED,
                    ],
                ))
                ->exists();

            if ($hasActiveTask) {
                throw ValidationException::withMessages([
                    'pickup_request_id' => 'La solicitud ya tiene una tarea operativa activa.',
                ]);
            }

            $task = OperationalTask::query()->create(array_merge([
                'task_code' => $this->nextCode(),
                'task_type' => $intakeMode->requiresFieldAssignment()
                    ? OperationalTaskType::CLIENT_PICKUP
                    : OperationalTaskType::HUB_INTAKE,
                'status' => OperationalTaskStatus::PENDING,
                'customer_id' => $pickupRequest->customer_id,
                'pickup_request_id' => $pickupRequest->getKey(),
                'service_location_id' => $pickupRequest->service_location_id,
            ], $attributes));

            AuditLog::log(
                'operations.task_created',
                $task,
                null,
                $task->only(['task_code', 'task_type', 'status', 'pickup_request_id']),
                'Tarea operativa creada desde una solicitud de recogida.',
            );

            return $task;
        });
    }

    public function transition(OperationalTask $task, OperationalTaskStatus $target): OperationalTask
    {
        return DB::transaction(function () use ($task, $target) {
            $task = OperationalTask::query()->lockForUpdate()->findOrFail($task->getKey());
            $current = $task->status instanceof OperationalTaskStatus
                ? $task->status
                : OperationalTaskStatus::from((string) $task->status);

            if (! $current->canTransitionTo($target)) {
                throw ValidationException::withMessages([
                    'status' => "No se permite pasar una tarea de {$current->value} a {$target->value}.",
                ]);
            }

            if ($target === OperationalTaskStatus::ASSIGNED && ! $this->hasAssignee($task)) {
                throw ValidationException::withMessages([
                    'assignee_type' => 'La tarea debe tener un responsable antes de asignarse.',
                ]);
            }

            $task->status = $target;
            $timestampField = match ($target) {
                OperationalTaskStatus::ASSIGNED => 'assigned_at',
                OperationalTaskStatus::ACCEPTED => 'accepted_at',
                OperationalTaskStatus::IN_PROGRESS => 'started_at',
                OperationalTaskStatus::COMPLETED, OperationalTaskStatus::PARTIALLY_COMPLETED,
                OperationalTaskStatus::FAILED => 'completed_at',
                OperationalTaskStatus::CANCELLED => 'cancelled_at',
                default => null,
            };

            if ($timestampField !== null) {
                $task->{$timestampField} = now();
            }

            $task->save();

            if (in_array($target, [
                OperationalTaskStatus::COMPLETED,
                OperationalTaskStatus::PARTIALLY_COMPLETED,
            ], true)) {
                $this->reconciliationLedger->recordCompletedOperationalTask($task);
            }

            AuditLog::log(
                'operations.task_transitioned',
                $task,
                ['status' => $current->value],
                ['status' => $target->value],
                'Cambio de estado de tarea operativa.',
            );

            return $task->refresh();
        });
    }

    private function hasAssignee(OperationalTask $task): bool
    {
        return filled($task->assignee_type)
            && ($task->assigned_driver_id !== null
                || $task->assigned_user_id !== null
                || filled($task->assigned_executor_name));
    }

    private function nextCode(): string
    {
        do {
            $code = 'OT-'.now()->format('ymd').'-'.Str::upper(Str::random(6));
        } while (OperationalTask::query()->where('task_code', $code)->exists());

        return $code;
    }
}
