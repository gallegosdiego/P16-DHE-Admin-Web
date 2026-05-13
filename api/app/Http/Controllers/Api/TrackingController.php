<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TrackingController extends Controller
{
    /**
     * Rastreo público de envío por guía.
     * No requiere autenticación.
     */
    public function track(Request $request): JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string', 'min:3'],
        ]);

        $code = strtoupper(trim($request->code));

        // Buscar por tracking_code o display_code
        $shipment = Shipment::where('tracking_code', $code)
            ->orWhere('display_code', $code)
            ->orWhere('display_code', '#' . $code) // El usuario puede omitir el #
            ->first();

        if (! $shipment) {
            return response()->json([
                'found' => false,
                'message' => 'No se encontró un envío con ese código de guía.',
            ], 404);
        }

        // Solo retornar info pública (sin datos financieros ni internos)
        return response()->json([
            'found' => true,
            'shipment' => [
                'tracking_code' => $shipment->tracking_code,
                'display_code' => $shipment->display_code,
                'status' => $shipment->status->value,
                'status_label' => $shipment->status->label(),
                'status_color' => $shipment->status->color(),
                'recipient_name' => $shipment->recipient_name,
                'recipient_city' => $shipment->recipient_city,
                'recipient_zone' => $shipment->recipient_zone,
                'created_at' => $shipment->created_at->toIso8601String(),
                'delivered_at' => $shipment->delivered_at?->toIso8601String(),
            ],
            'timeline' => $shipment->events()
                ->select('to_status', 'description', 'occurred_at')
                ->orderBy('occurred_at')
                ->get()
                ->map(fn ($event) => [
                    'status' => $event->to_status,
                    'description' => $event->description,
                    'timestamp' => $event->occurred_at->toIso8601String(),
                ]),
        ]);
    }
}
