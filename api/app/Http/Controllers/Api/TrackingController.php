<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Rastreo público de envíos. Sin autenticación, y por eso con cuidado.
 *
 * Antes bastaba el código de guía (#DHE00042), un consecutivo global: iterando
 * 1..N cualquiera extraía el nombre y la ciudad de cada destinatario. Ahora hay
 * dos caminos, y ninguno es enumerable:
 *
 *  1. **Token opaco** (`?token=…`). 190 bits aleatorios sin relación con el
 *     consecutivo. Es lo que se incrusta en los enlaces de notificación al
 *     destinatario: un clic, sin fricción.
 *  2. **Código de guía + segundo factor** (`?code=…&phone=1234`). Para quien
 *     escribe la guía a mano. Los cuatro últimos dígitos del teléfono del
 *     destinatario son un dato que el consecutivo no revela, así que adivinar
 *     el código ya no basta. Es la práctica habitual de las mensajerías.
 */
class TrackingController extends Controller
{
    public function track(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['nullable', 'string', 'size:32'],
            'code' => ['nullable', 'string', 'min:3', 'max:40'],
            'phone' => ['nullable', 'string', 'max:24'],
        ]);

        $shipment = isset($validated['token'])
            ? $this->findByToken($validated['token'])
            : $this->findByCodeAndPhone($request, $validated);

        if (! $shipment) {
            // Misma respuesta para «no existe» y «segundo factor incorrecto».
            // Distinguirlas volvería a permitir confirmar qué códigos existen.
            return response()->json([
                'found' => false,
                'message' => 'No encontramos un envío con esos datos. Verifica la guía y el teléfono.',
            ], 404);
        }

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

    private function findByToken(string $token): ?Shipment
    {
        return Shipment::where('public_token', $token)->first();
    }

    /**
     * @param  array{code?: string|null, phone?: string|null}  $validated
     */
    private function findByCodeAndPhone(Request $request, array $validated): ?Shipment
    {
        $code = isset($validated['code']) ? strtoupper(trim($validated['code'])) : null;
        $phone = isset($validated['phone']) ? preg_replace('/\D/', '', $validated['phone']) : null;

        if ($code === null || $code === '') {
            abort(422, 'Indica el código de guía o el enlace de rastreo.');
        }

        // El segundo factor es obligatorio para las búsquedas por código: sin él,
        // el código consecutivo volvería a ser enumerable.
        if ($phone === null || strlen($phone) < 4) {
            abort(422, 'Indica los últimos 4 dígitos del teléfono del destinatario.');
        }

        $last4 = substr($phone, -4);

        $shipment = Shipment::where('tracking_code', $code)
            ->orWhere('display_code', $code)
            ->orWhere('display_code', '#'.$code)
            ->first();

        if (! $shipment) {
            return null;
        }

        // Comparar solo los dígitos, ignorando el formato con que se guardó.
        $storedDigits = preg_replace('/\D/', '', (string) $shipment->recipient_phone);

        if ($storedDigits === '' || substr($storedDigits, -4) !== $last4) {
            return null;
        }

        return $shipment;
    }
}
