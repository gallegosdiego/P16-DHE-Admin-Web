<?php

namespace App\Support;

use App\Domain\Shipment\Models\Shipment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

final class ShipmentEvidenceStorage
{
    public function store(Request $request, Shipment $shipment): string
    {
        $file = $request->file('evidence_photo');

        if (! $file || ! $file->isValid()) {
            throw ValidationException::withMessages([
                'evidence_photo' => ['La evidencia de entrega no es un archivo valido. Toma la foto de nuevo.'],
            ]);
        }

        $extension = strtolower($file->guessExtension() ?: $file->getClientOriginalExtension() ?: 'jpg');
        $extension = match ($extension) {
            'jpeg', 'jpg' => 'jpg',
            'png' => 'png',
            default => 'jpg',
        };

        $filename = $shipment->id.'_'.now()->timestamp.'.'.$extension;

        try {
            $disk = Storage::disk('public');
            $disk->makeDirectory('evidence');

            $path = $file->storeAs('evidence', $filename, 'public');

            if (! is_string($path) || $path === '' || ! $disk->exists($path)) {
                throw new RuntimeException('Evidence photo could not be persisted on the public disk.');
            }

            return $path;
        } catch (Throwable $exception) {
            Log::warning('shipments.evidence_photo.store_failed', [
                'shipment_id' => $shipment->id,
                'disk' => 'public',
                'message' => $exception->getMessage(),
            ]);

            throw ValidationException::withMessages([
                'evidence_photo' => [
                    'No se pudo guardar la evidencia de entrega. Intenta tomar la foto de nuevo o reporta a administracion.',
                ],
            ]);
        }
    }
}
