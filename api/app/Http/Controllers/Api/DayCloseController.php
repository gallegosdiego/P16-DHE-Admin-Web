<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Services\DayCloseService;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class DayCloseController extends Controller
{
    public function __construct(private readonly DayCloseService $service) {}

    public function summary(Request $request)
    {
        $date = $request->validate(['date' => ['nullable', 'date_format:Y-m-d']])['date'] ?? now()->toDateString();

        return response()->json($this->service->summary($date));
    }

    public function returns(Request $request)
    {
        $data = $request->validate(['shipment_ids' => ['required', 'array', 'min:1'], 'shipment_ids.*' => ['integer', 'exists:shipments,id']]);
        $key = $request->header('Idempotency-Key');
        abort_unless($key, 422, 'Idempotency-Key es obligatorio.');

        return response()->json($this->service->warehouseReturns($data['shipment_ids'], $request->user(), $key));
    }
}
