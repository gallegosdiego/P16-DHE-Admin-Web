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
 * Sigue el mismo patron que la evidencia de recepcion: disco publico, nombre
 * irrepetible, y hash del contenido ya escrito —no del temporal— para que el
 * sha256 pruebe lo que quedo guardado y no lo que se subio.
 *
 * A diferencia de la evidencia operativa, aqui se admite PDF: los bancos
 * entregan el soporte en ese formato tan a menudo como en imagen.
 */
final class ClientPayoutSupportStorage
{
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

        $extension = strtolower($file->guessExtension() ?: $file->getClientOriginalExtension() ?: 'jpg');
        $extension = match ($extension) {
            'jpeg', 'jpg' => 'jpg',
            'png' => 'png',
            'webp' => 'webp',
            'pdf' => 'pdf',
            default => 'jpg',
        };
        $filename = $payout->id.'_'.now()->format('YmdHisv').'_'.bin2hex(random_bytes(4)).'.'.$extension;

        try {
            $disk = Storage::disk('public');
            $disk->makeDirectory(self::DIRECTORY);
            $path = $file->storeAs(self::DIRECTORY, $filename, 'public');

            if (! is_string($path) || $path === '' || ! $disk->exists($path)) {
                throw new RuntimeException('Client payout support could not be persisted on the public disk.');
            }

            return [
                'support_path' => $path,
                'support_sha256' => hash('sha256', $disk->get($path)),
                'support_mime' => $disk->mimeType($path) ?: $file->getMimeType(),
                'support_size' => $disk->size($path),
            ];
        } catch (Throwable $exception) {
            Log::warning('financial.client_payout.support.store_failed', [
                'client_cod_payout_id' => $payout->id,
                'disk' => 'public',
                'message' => $exception->getMessage(),
            ]);

            throw ValidationException::withMessages([
                'support' => ['No se pudo guardar el soporte. Intenta de nuevo o informa a administracion.'],
            ]);
        }
    }
}
