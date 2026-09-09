<?php

namespace App\Http\Controllers\Api;

use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Services\DriverReceptionService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DriverReceptionController extends Controller
{
    public function validateScan(Request $request, DriverReceptionService $reception): JsonResponse
    {
        $validated = $request->validate([
            'scan_code' => ['required', 'string', 'max:191'],
            'driver_id' => ['prohibited'],
        ], [
            'driver_id.prohibited' => 'No puedes recibir paquetes a nombre de otro piloto.',
        ]);

        $driverId = $this->authenticatedDriverId($request);

        return response()->json($reception->validateScan($validated['scan_code'], $driverId));
    }

    public function confirm(Request $request, DriverReceptionService $reception): JsonResponse
    {
        $validated = $request->validate([
            'driver_id' => ['prohibited'],
            'device_id' => ['required', 'string', 'max:120'],
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'occurred_at' => ['required', 'date'],
            'packages' => ['required', 'array', 'min:1', 'max:50'],
            'packages.*.scan_code' => ['required', 'string', 'max:191'],
            'packages.*.physical_condition' => ['nullable', Rule::in(['intact', 'observed_damage', 'unknown'])],
        ], [
            'driver_id.prohibited' => 'No puedes recibir paquetes a nombre de otro piloto.',
        ]);

        $idempotencyKey = trim((string) $request->header('Idempotency-Key'));
        if ($idempotencyKey === '' || mb_strlen($idempotencyKey) > 191) {
            throw ValidationException::withMessages([
                'idempotency_key' => 'El encabezado Idempotency-Key es obligatorio y debe tener máximo 191 caracteres.',
            ]);
        }

        $driverId = $this->authenticatedDriverId($request);
        $driver = Driver::query()->findOrFail($driverId);

        return response()->json($reception->confirm($driver, $request->user(), $validated, $idempotencyKey));
    }

    private function authenticatedDriverId(Request $request): int
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);
        abort_if($driverId <= 0, 403, 'El usuario no está vinculado a un piloto.');

        return $driverId;
    }
}
