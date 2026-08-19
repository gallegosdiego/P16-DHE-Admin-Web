<?php

namespace App\Domain\Financial\Services;

use App\Domain\Financial\Models\ClientCodPayout;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

/**
 * Guarda el comprobante de una transferencia COD al cliente.
 *
 * En el disco PRIVADO, deliberadamente. Un comprobante bancario contiene el
 * numero de cuenta completo, titular y monto: publicarlo en /storage anularia
 * el enmascarado con que ese numero viaja al navegador. El archivo solo sale
 * por el endpoint autenticado de descarga.
 *
 * El hash se calcula en streaming sobre el archivo ya escrito —no sobre el
 * temporal— para que pruebe lo que quedo guardado sin materializar un PDF de
 * 5 MB en memoria en un hosting compartido.
 */
final class ClientPayoutSupportStorage
{
    public const DISK = 'local';

    private const DIRECTORY = 'financial/support/client-payouts';

    /**
     * @return array{
     *     support_path: string,
     *     support_sha256: string,
     *     support_mime: string|null,
     *     support_size: int|null
     * }
     */
    public function store(UploadedFile $file, ClientCodPayout $payout): array
    {
        if (! $file->isValid()) {
            throw ValidationException::withMessages([
                'support' => ['El soporte no llego completo. Vuelve a adjuntarlo.'],
            ]);
        }

        $extension = strtolower($file->guessExtension() ?: $file->getClientOriginalExtension() ?: '');
        $extension = match ($extension) {
            'jpeg', 'jpg' => 'jpg',
            'png' => 'png',
            'webp' => 'webp',
            'pdf' => 'pdf',
            // Cerrado a proposito: un default que renombra a .jpg lo que no
            // reconoce guardaria el archivo con una extension mentirosa el dia
            // que el validador del endpoint se ampliara sin tocar esta lista.
            default => throw ValidationException::withMessages([
                'support' => ['El soporte debe ser JPG, PNG, WEBP o PDF.'],
            ]),
        };
        $filename = $payout->id.'_'.now()->format('YmdHisv').'_'.bin2hex(random_bytes(4)).'.'.$extension;

        try {
            $disk = Storage::disk(self::DISK);
            $disk->makeDirectory(self::DIRECTORY);
            $path = $file->storeAs(self::DIRECTORY, $filename, self::DISK);

            if (! is_string($path) || $path === '' || ! $disk->exists($path)) {
                throw new RuntimeException('Client payout support could not be persisted on the private disk.');
            }

            $sha256 = hash_file('sha256', $disk->path($path));
            if ($sha256 === false) {
                throw new RuntimeException('Client payout support could not be hashed after writing.');
            }

            return [
                'support_path' => $path,
                'support_sha256' => $sha256,
                'support_mime' => $disk->mimeType($path) ?: $file->getMimeType(),
                'support_size' => $disk->size($path),
            ];
        } catch (Throwable $exception) {
            if ($exception instanceof ValidationException) {
                throw $exception;
            }

            Log::warning('financial.client_payout.support.store_failed', [
                'client_cod_payout_id' => $payout->id,
                'disk' => self::DISK,
                'message' => $exception->getMessage(),
            ]);

            throw ValidationException::withMessages([
                'support' => ['No se pudo guardar el soporte. Intenta de nuevo o informa a administracion.'],
            ]);
        }
    }
}
