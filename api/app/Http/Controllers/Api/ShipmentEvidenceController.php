<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Models\DeliveryAttempt;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Models\ShipmentEvidence;
use App\Domain\Shipment\Services\CustodyGuard;
use App\Http\Controllers\Controller;
use App\Support\ShipmentEvidenceStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Fotos agregadas después de la entrega o la novedad (contrato 2026-09-26 §3).
 *
 * Solo agrega: cada foto es una fila nueva `late_photo` con actor y hora;
 * nunca reemplaza una foto existente ni la columna legada del envío.
 */
class ShipmentEvidenceController extends Controller
{
    public const LATE_WINDOW_HOURS = 72;

    public function store(Request $request, Shipment $shipment, ShipmentEvidenceStorage $storage, CustodyGuard $guard): JsonResponse
    {
        $user = $request->user();
        $scopedDriverId = (int) $request->attributes->get('_scoped_driver_id', 0);
        $latestAttempt = DeliveryAttempt::query()
            ->where('shipment_id', $shipment->id)
            ->latest('attempt_number')
            ->latest('id')
            ->first();

        if (! $user->can('shipments.edit')) {
            // Piloto: solo el del último intento o quien tiene el paquete,
            // y dentro de las 72 h siguientes al intento.
            if ($scopedDriverId <= 0) {
                return response()->json(['message' => 'No tienes permiso para agregar fotos a este envío.'], 403);
            }

            $isAttemptDriver = $latestAttempt !== null && (int) $latestAttempt->driver_id === $scopedDriverId;
            $isCustodian = ($guard->holdingDriver($shipment)['id'] ?? null) === $scopedDriverId;

            if (! $isAttemptDriver && ! $isCustodian) {
                return response()->json([
                    'message' => 'Solo el piloto que intentó la entrega o quien tiene el paquete puede agregarle fotos.',
                ], 403);
            }

            $attemptAt = $latestAttempt?->finished_at ?? $latestAttempt?->created_at;
            if ($attemptAt !== null && $attemptAt->lt(now()->subHours(self::LATE_WINDOW_HOURS))) {
                return response()->json([
                    'message' => 'Ya pasaron más de 72 horas desde el intento de entrega. Pide a administración que agregue las fotos.',
                    'code' => 'late_photo_window_closed',
                ], 422);
            }
        }

        $request->validate([
            'photos' => ['required', 'array', 'min:1', 'max:'.ShipmentEvidenceStorage::MAX_PHOTOS],
            'photos.*' => ['required', 'image', 'mimes:jpeg,png,jpg,webp', 'max:'.ShipmentEvidenceStorage::MAX_KILOBYTES],
            'note' => ['nullable', 'string', 'max:280'],
        ], ShipmentEvidenceStorage::validationMessages('photos'));

        $stored = $storage->storeMany($storage->uploadedPhotos($request, 'photos', null), $shipment, 'photos');

        try {
            $created = DB::transaction(fn () => $storage->record(
                $shipment,
                $stored,
                'late_photo',
                $user,
                $latestAttempt?->id,
                [
                    'source' => $scopedDriverId > 0 ? 'mobile' : 'admin_panel',
                    'metadata' => [
                        'note' => $request->input('note'),
                        'actor_user_id' => $user->id,
                        'actor_name' => $user->name,
                        'added_after_attempt_id' => $latestAttempt?->id,
                    ],
                ],
            ));
        } catch (\Throwable $exception) {
            $storage->discard($stored);

            throw $exception;
        }

        return response()->json([
            'data' => $created->map(fn (ShipmentEvidence $evidence) => [
                'id' => $evidence->id,
                'url' => $evidence->url,
                'evidence_type' => $evidence->evidence_type,
                'captured_at' => $evidence->captured_at?->toIso8601String(),
            ])->values(),
        ], 201);
    }
}
