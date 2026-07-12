<?php

namespace App\Domain\Pickup\Services;

use App\Domain\Pickup\Enums\PickupBatchStatus;
use App\Domain\Pickup\Models\PickupBatch;
use App\Domain\Shared\Models\AuditLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PickupBatchService
{
    public function transition(PickupBatch $batch, PickupBatchStatus $target): PickupBatch
    {
        return DB::transaction(function () use ($batch, $target) {
            $batch = PickupBatch::query()->lockForUpdate()->findOrFail($batch->getKey());
            $current = $batch->status instanceof PickupBatchStatus
                ? $batch->status
                : PickupBatchStatus::from((string) $batch->status);

            if (! $current->canTransitionTo($target)) {
                throw ValidationException::withMessages([
                    'status' => "No se permite pasar un lote de {$current->value} a {$target->value}.",
                ]);
            }

            if (in_array($target, [PickupBatchStatus::COMPLETED, PickupBatchStatus::COMPLETED_WITH_DIFFERENCES], true)) {
                $this->validateClosingCounts($batch, $target);
                $batch->completed_at = now();
            }

            $batch->status = $target;
            $batch->save();

            AuditLog::log(
                'operations.pickup_batch_transitioned',
                $batch,
                ['status' => $current->value],
                ['status' => $target->value],
                'Cambio de estado del lote físico de recogida.',
            );

            return $batch->refresh();
        });
    }

    private function validateClosingCounts(PickupBatch $batch, PickupBatchStatus $target): void
    {
        $accounted = $batch->received_packages + $batch->rejected_packages + $batch->missing_packages;

        if ($accounted !== $batch->expected_packages) {
            throw ValidationException::withMessages([
                'expected_packages' => 'Todo paquete esperado debe quedar recibido, rechazado o faltante.',
            ]);
        }

        $hasDifferences = $batch->rejected_packages > 0 || $batch->missing_packages > 0;
        if ($target === PickupBatchStatus::COMPLETED && $hasDifferences) {
            throw ValidationException::withMessages([
                'status' => 'Un lote con rechazados o faltantes debe cerrarse con diferencias.',
            ]);
        }

        if ($target === PickupBatchStatus::COMPLETED_WITH_DIFFERENCES && ! $hasDifferences) {
            throw ValidationException::withMessages([
                'status' => 'Un lote sin novedades debe cerrarse como completado.',
            ]);
        }
    }
}
