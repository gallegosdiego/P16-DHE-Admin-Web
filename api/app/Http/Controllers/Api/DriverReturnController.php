<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Services\DriverReturnService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class DriverReturnController
{
    public function validateScan(Request $request, DriverReturnService $service)
    {
        $validated = $request->validate(['scan_code' => 'required|string|max:191', 'driver_id' => 'prohibited']);
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);
        abort_if($driverId <= 0, 403);

        return response()->json($service->validateScan($driverId, trim($validated['scan_code'])));
    }

    public function store(Request $r, DriverReturnService $s)
    {
        $v = $r->validate(['driver_id' => 'prohibited', 'device_id' => 'required|string|max:120', 'lat' => 'nullable|required_with:lng|numeric|between:-90,90', 'lng' => 'nullable|required_with:lat|numeric|between:-180,180', 'occurred_at' => 'required|date', 'reason' => 'nullable|string|max:500', 'packages' => 'required|array|min:1|max:50', 'packages.*.scan_code' => 'required|string|max:191']);
        $k = trim((string) $r->header('Idempotency-Key'));
        if ($k === '' || mb_strlen($k) > 191) {
            throw ValidationException::withMessages(['idempotency_key' => 'Idempotency-Key es obligatorio.']);
        }$id = (int) $r->attributes->get('_scoped_driver_id', 0);
        abort_if($id <= 0, 403);

        return response()->json($s->returns($r->user(), $id, $v, $k));
    }

    public function confirm(Request $r, DriverReturnService $s)
    {
        $v = $r->validate(['scan_code' => 'required|string|max:191']);

        return response()->json($s->confirmHub($r->user(), $v['scan_code']));
    }
}
