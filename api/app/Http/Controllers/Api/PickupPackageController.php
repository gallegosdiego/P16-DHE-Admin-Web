<?php

namespace App\Http\Controllers\Api;

use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Pickup\Services\AddPickupPackage;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PickupPackageController extends Controller
{
    public function store(
        Request $request,
        PickupRequest $pickupRequest,
        AddPickupPackage $service,
    ): JsonResponse {
        $user = $request->user();
        if ($user->client_id !== null) {
            abort_unless((int) $user->client_id === (int) $pickupRequest->customer_id, 403);
        }

        $payload = $request->validate($this->rules());
        $idempotencyKey = trim((string) $request->header('Idempotency-Key'));
        if ($idempotencyKey === '' || mb_strlen($idempotencyKey) > 191) {
            return response()->json([
                'message' => 'Se requiere un encabezado Idempotency-Key válido.',
                'errors' => ['idempotency_key' => ['Use una llave única de máximo 191 caracteres.']],
            ], 422);
        }

        $package = $service->execute(
            $pickupRequest,
            'user:'.$user->getAuthIdentifier(),
            $idempotencyKey,
            $payload,
        );

        return response()->json([
            'data' => $package,
            'pickup_request' => $pickupRequest->fresh(['packages.shipment']),
        ], 201);
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        return [
            'recipient_name' => ['required', 'string', 'max:120'],
            'recipient_phone' => ['required', 'string', 'max:24'],
            'delivery_address_line1' => ['required', 'string', 'max:200'],
            'delivery_address_complement' => ['nullable', 'string', 'max:120'],
            'delivery_zone' => ['nullable', 'string', 'max:60'],
            'delivery_city' => ['nullable', 'string', 'max:60'],
            'delivery_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'delivery_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'is_cod' => ['sometimes', 'boolean'],
            'requested_cod_amount' => ['nullable', 'integer', 'min:0', 'max:50000000'],
            'is_fragile' => ['sometimes', 'boolean'],
            'package_type' => ['nullable', 'string', 'max:60'],
            'size_code' => ['nullable', 'string', 'max:40'],
            'approx_weight_kg' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'special_handling_notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
