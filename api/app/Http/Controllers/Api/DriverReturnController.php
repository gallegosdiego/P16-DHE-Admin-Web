<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Services\DriverReturnService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class DriverReturnController
{
    public function store(Request $r, DriverReturnService $s)
    {
        $v = $r->validate(['device_id' => 'required|string|max:120', 'lat' => 'required|numeric|between:-90,90', 'lng' => 'required|numeric|between:-180,180', 'occurred_at' => 'required|date', 'packages' => 'required|array|min:1|max:50', 'packages.*.scan_code' => 'required|string|max:191']);
        $k = trim((string) $r->header('Idempotency-Key'));
        if ($k === '') {
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
