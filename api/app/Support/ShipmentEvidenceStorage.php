<?php

namespace App\Support;

use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Models\ShipmentEvidence;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

/**
 * Fotos de evidencia de un envío (entrega, novedad o agregadas después).
 *
 * Los archivos se escriben en el disco público ANTES de abrir la transacción
 * de base de datos y se borran con `discard()` si la transacción falla: así
 * un rollback no deja fotos huérfanas en el disco ni filas sin archivo.
 */
final class ShipmentEvidenceStorage
{
    public const MAX_PHOTOS = 6;

    public const MAX_KILOBYTES = 5120;

    /**
     * Reglas de validación para `evidence_photos[]` (0..6) y el legado
     * `evidence_photo` (1 archivo). Solo se agregan si el campo viene: las
     * APKs viejas mandan el formulario sin ellos.
     *
     * @return array<string, array<int, string>>
     */
    public static function validationRules(Request $request): array
    {
        $rules = [];

        if ($request->hasFile('evidence_photo')) {
            $rules['evidence_photo'] = ['image', 'mimes:jpeg,png,jpg,webp', 'max:'.self::MAX_KILOBYTES];
        }

        if ($request->has('evidence_photos') || $request->hasFile('evidence_photos')) {
            $rules['evidence_photos'] = ['nullable', 'array', 'max:'.self::MAX_PHOTOS];
            $rules['evidence_photos.*'] = ['image', 'mimes:jpeg,png,jpg,webp', 'max:'.self::MAX_KILOBYTES];
        }

        return $rules;
    }

    /** @return array<string, string> */
    public static function validationMessages(string $field = 'evidence_photos'): array
    {
        return [
            "{$field}.array" => 'Las fotos deben enviarse como una lista.',
            "{$field}.min" => 'Agrega al menos una foto.',
            "{$field}.max" => 'Puedes enviar máximo '.self::MAX_PHOTOS.' fotos.',
            "{$field}.required" => 'Agrega al menos una foto.',
            "{$field}.*.image" => 'Cada foto debe ser una imagen (jpg, png o webp).',
            "{$field}.*.mimes" => 'Cada foto debe ser una imagen (jpg, png o webp).',
            "{$field}.*.max" => 'Cada foto debe pesar máximo 5 MB.',
            'evidence_photo.image' => 'La foto debe ser una imagen (jpg, png o webp).',
            'evidence_photo.mimes' => 'La foto debe ser una imagen (jpg, png o webp).',
            'evidence_photo.max' => 'La foto debe pesar máximo 5 MB.',
        ];
    }

    /**
     * Archivos enviados: primero `evidence_photos[]`, luego el legado
     * `evidence_photo`.
     *
     * @return list<UploadedFile>
     */
    public function uploadedPhotos(Request $request, string $arrayField = 'evidence_photos', ?string $legacyField = 'evidence_photo'): array
    {
        $files = [];
        $many = $request->file($arrayField);

        foreach (is_array($many) ? $many : ($many ? [$many] : []) as $file) {
            if ($file instanceof UploadedFile) {
                $files[] = $file;
            }
        }

        if ($legacyField !== null && ($single = $request->file($legacyField)) instanceof UploadedFile) {
            $files[] = $single;
        }

        return $files;
    }

    /**
     * Compatibilidad: guarda solo `evidence_photo` y devuelve la ruta.
     */
    public function store(Request $request, Shipment $shipment): string
    {
        $file = $request->file('evidence_photo');

        if (! $file instanceof UploadedFile) {
            throw ValidationException::withMessages([
                'evidence_photo' => ['La evidencia de entrega no es un archivo valido. Toma la foto de nuevo.'],
            ]);
        }

        return $this->storeFile($file, $shipment, 'evidence_photo')['path'];
    }

    /**
     * @param  list<UploadedFile>  $files
     * @return list<array{path:string,sha256:string,mime_type:?string,file_size:?int,width:?int,height:?int}>
     */
    public function storeMany(array $files, Shipment $shipment, string $field = 'evidence_photos'): array
    {
        $stored = [];

        try {
            foreach ($files as $file) {
                $stored[] = $this->storeFile($file, $shipment, $field);
            }
        } catch (Throwable $exception) {
            $this->discard($stored);

            throw $exception;
        }

        return $stored;
    }

    /**
     * @return array{path:string,sha256:string,mime_type:?string,file_size:?int,width:?int,height:?int}
     */
    public function storeFile(UploadedFile $file, Shipment $shipment, string $field = 'evidence_photos'): array
    {
        if (! $file->isValid()) {
            throw ValidationException::withMessages([
                $field => ['La evidencia de entrega no es un archivo valido. Toma la foto de nuevo.'],
            ]);
        }

        $extension = strtolower($file->guessExtension() ?: $file->getClientOriginalExtension() ?: 'jpg');
        $extension = match ($extension) {
            'jpeg', 'jpg' => 'jpg',
            'png' => 'png',
            'webp' => 'webp',
            default => 'jpg',
        };

        // Varias fotos en el mismo segundo: el sufijo aleatorio evita que una
        // pise a la otra (antes el nombre era solo envío + timestamp).
        $filename = $shipment->id.'_'.now()->timestamp.'_'.Str::lower(Str::random(8)).'.'.$extension;

        try {
            $disk = Storage::disk('public');
            $disk->makeDirectory('evidence');

            $realPath = $file->getRealPath();
            $sha256 = is_string($realPath) && $realPath !== '' ? hash_file('sha256', $realPath) : false;
            $dimensions = is_string($realPath) && $realPath !== '' ? @getimagesize($realPath) : false;

            $path = $file->storeAs('evidence', $filename, 'public');

            if (! is_string($path) || $path === '' || ! $disk->exists($path)) {
                throw new RuntimeException('Evidence photo could not be persisted on the public disk.');
            }

            return [
                'path' => $path,
                'sha256' => is_string($sha256) ? $sha256 : hash('sha256', $path),
                'mime_type' => $file->getMimeType() ?: null,
                'file_size' => $file->getSize() ?: null,
                'width' => is_array($dimensions) ? (int) $dimensions[0] : null,
                'height' => is_array($dimensions) ? (int) $dimensions[1] : null,
            ];
        } catch (Throwable $exception) {
            Log::warning('shipments.evidence_photo.store_failed', [
                'shipment_id' => $shipment->id,
                'disk' => 'public',
                'message' => $exception->getMessage(),
            ]);

            throw ValidationException::withMessages([
                $field => [
                    'No se pudo guardar la evidencia de entrega. Intenta tomar la foto de nuevo o reporta a administracion.',
                ],
            ]);
        }
    }

    /**
     * Borra archivos ya escritos cuando la operación no se completó.
     *
     * @param  list<array{path:string}>  $stored
     */
    public function discard(array $stored): void
    {
        $paths = array_values(array_filter(array_map(fn (array $file) => $file['path'] ?? null, $stored)));

        if ($paths === []) {
            return;
        }

        try {
            Storage::disk('public')->delete($paths);
        } catch (Throwable $exception) {
            Log::warning('shipments.evidence_photo.discard_failed', ['paths' => $paths, 'message' => $exception->getMessage()]);
        }
    }

    /**
     * Crea una fila `shipment_evidence` por archivo. Solo agrega: nunca
     * sobrescribe. Un reenvío idéntico (mismo sha256 en el mismo envío) no
     * duplica la fila; el archivo repetido se conserva porque la columna
     * legada `shipments.evidence_photo` puede apuntar a él.
     *
     * @param  list<array{path:string,sha256:string,mime_type:?string,file_size:?int,width:?int,height:?int}>  $stored
     * @param  array<string, mixed>  $extra
     * @return Collection<int, ShipmentEvidence>
     */
    public function record(Shipment $shipment, array $stored, string $evidenceType, ?User $actor, ?int $deliveryAttemptId = null, array $extra = []): Collection
    {
        $created = collect();

        foreach ($stored as $file) {
            $exists = ShipmentEvidence::query()
                ->where('shipment_id', $shipment->id)
                ->where('sha256', $file['sha256'])
                ->exists();

            if ($exists) {
                continue;
            }

            $created->push(ShipmentEvidence::query()->create([
                'shipment_id' => $shipment->id,
                'delivery_attempt_id' => $deliveryAttemptId,
                'evidence_type' => $evidenceType,
                'original_path' => $file['path'],
                'sha256' => $file['sha256'],
                'mime_type' => $file['mime_type'],
                'file_size' => $file['file_size'],
                'width' => $file['width'],
                'height' => $file['height'],
                'source' => $extra['source'] ?? 'mobile',
                'lat' => $extra['lat'] ?? null,
                'lng' => $extra['lng'] ?? null,
                'captured_at' => now(),
                'received_at' => now(),
                'created_by' => $actor?->id,
                'metadata_json' => $extra['metadata'] ?? null,
            ]));
        }

        return $created;
    }
}
