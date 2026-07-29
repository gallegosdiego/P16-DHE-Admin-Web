<?php

namespace App\Domain\Pickup\Services;

use App\Domain\Pickup\Models\PickupBatchItem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

final class PickupReceptionEvidenceStorage
{
    /**
     * @return array{
     *     original_path: string,
     *     sha256: string,
     *     mime_type: string|null,
     *     file_size: int|null,
     *     width: int|null,
     *     height: int|null
     * }
     */
    public function store(UploadedFile $file, PickupBatchItem $item): array
    {
        if (! $file->isValid()) {
            throw ValidationException::withMessages([
                'evidence_photo' => ['La evidencia de la novedad no es valida. Toma la foto de nuevo.'],
            ]);
        }

        $temporaryPath = $file->getRealPath();
        $dimensions = is_string($temporaryPath) ? @getimagesize($temporaryPath) : false;
        $extension = strtolower($file->guessExtension() ?: $file->getClientOriginalExtension() ?: 'jpg');
        $extension = match ($extension) {
            'jpeg', 'jpg' => 'jpg',
            'png' => 'png',
            'webp' => 'webp',
            default => 'jpg',
        };
        $filename = $item->id.'_'.now()->format('YmdHisv').'_'.bin2hex(random_bytes(4)).'.'.$extension;

        try {
            $disk = Storage::disk('public');
            $disk->makeDirectory('operations/evidence/reception');
            $path = $file->storeAs('operations/evidence/reception', $filename, 'public');

            if (! is_string($path) || $path === '' || ! $disk->exists($path)) {
                throw new RuntimeException('Reception evidence could not be persisted on the public disk.');
            }

            $contents = $disk->get($path);

            return [
                'original_path' => $path,
                'sha256' => hash('sha256', $contents),
                'mime_type' => $disk->mimeType($path) ?: $file->getMimeType(),
                'file_size' => $disk->size($path),
                'width' => is_array($dimensions) ? (int) ($dimensions[0] ?? 0) : null,
                'height' => is_array($dimensions) ? (int) ($dimensions[1] ?? 0) : null,
            ];
        } catch (Throwable $exception) {
            Log::warning('pickup_reception.evidence_photo.store_failed', [
                'pickup_batch_item_id' => $item->id,
                'disk' => 'public',
                'message' => $exception->getMessage(),
            ]);

            throw ValidationException::withMessages([
                'evidence_photo' => [
                    'No se pudo guardar la evidencia de la novedad. Toma la foto de nuevo o informa a administracion.',
                ],
            ]);
        }
    }
}
