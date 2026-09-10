<?php

namespace App\Domain\Pickup\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Guarda la foto con la que el cliente declara un paquete.
 *
 * Sigue el mismo patrón que la evidencia de recepción —disco público, nombre
 * opaco, hash SHA-256 para poder auditar que el archivo no cambió— pero vive
 * aparte porque responde otra pregunta: aquella documenta una novedad del
 * mostrador; esta es lo que el cliente dijo tener antes de que nadie mirara.
 */
class DeclaredPhotoStorage
{
    private const DIRECTORIO = 'operations/evidence/declared';

    /**
     * @return array{path: string, sha256: string, mime_type: string, file_size: int}
     */
    public function store(UploadedFile $file): array
    {
        $extension = strtolower($file->getClientOriginalExtension() ?: $file->guessExtension() ?: 'bin');
        $nombre = Str::uuid()->toString().'.'.$extension;

        $disk = Storage::disk('public');
        $disk->makeDirectory(self::DIRECTORIO);
        $path = $file->storeAs(self::DIRECTORIO, $nombre, 'public');

        if (! is_string($path) || $path === '' || ! $disk->exists($path)) {
            throw new RuntimeException('La foto declarada no pudo guardarse en el disco público.');
        }

        $contenido = $disk->get($path);

        return [
            'path' => $path,
            'sha256' => hash('sha256', $contenido),
            'mime_type' => $disk->mimeType($path) ?: (string) $file->getMimeType(),
            'file_size' => (int) $disk->size($path),
        ];
    }

    /** Borra archivos huérfanos si la transacción que los acompañaba falló. */
    public function discard(array $paths): void
    {
        foreach ($paths as $path) {
            if (is_string($path) && $path !== '') {
                Storage::disk('public')->delete($path);
            }
        }
    }
}
