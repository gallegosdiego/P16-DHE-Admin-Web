<?php

namespace App\Http\Controllers\Api;

use App\Domain\Operations\Enums\IntakeMode;
use App\Domain\Pickup\Services\CompleteWalkInIntake;
use App\Domain\Pickup\Services\CreatePickupRequest;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PickupIntakeController extends Controller
{
    public function completeWalkIn(Request $request, CompleteWalkInIntake $service): JsonResponse
    {
        abort_if($request->user()->client_id !== null, 403, 'El ingreso espontáneo solo puede registrarlo el personal de la sede.');

        $payload = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:clients,id'],
            'service_location_id' => ['required', 'integer', 'exists:service_locations,id'],
            'contact_name' => ['required', 'string', 'max:120'],
            'contact_phone' => ['required', 'string', 'max:24'],
            'delivered_by_name' => ['nullable', 'string', 'max:120'],
            'delivered_by_phone' => ['nullable', 'string', 'max:24'],
            'delivered_by_relationship' => ['nullable', 'string', 'max:80'],
            'delivered_by_notes' => ['nullable', 'string', 'max:1000'],
            'reception_notes' => ['nullable', 'string', 'max:1000'],
            'special_instructions' => ['nullable', 'string', 'max:2000'],
            'default_shipping_cost' => ['required', 'integer', 'min:0'],
            'default_driver_fee' => ['required', 'integer', 'min:0'],
            'non_cod_payment_type' => ['nullable', Rule::in(['cash_on_delivery', 'post_sale', 'prepaid', 'mercado_libre'])],
            'packages' => ['required', 'array', 'min:1', 'max:100'],
            'packages.*.recipient_name' => ['required', 'string', 'max:120'],
            'packages.*.recipient_phone' => ['required', 'string', 'max:24'],
            'packages.*.delivery_address_line1' => ['required', 'string', 'max:200'],
            'packages.*.delivery_address_complement' => ['nullable', 'string', 'max:120'],
            'packages.*.delivery_zone' => ['nullable', 'string', 'max:60'],
            'packages.*.delivery_city' => ['nullable', 'string', 'max:60'],
            'packages.*.delivery_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'packages.*.delivery_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'packages.*.is_cod' => ['sometimes', 'boolean'],
            'packages.*.requested_cod_amount' => ['nullable', 'integer', 'min:0', 'max:50000000'],
            'packages.*.is_fragile' => ['sometimes', 'boolean'],
            'packages.*.package_type' => ['nullable', 'string', 'max:60'],
            'packages.*.size_code' => ['nullable', 'string', 'max:40'],
            'packages.*.approx_weight_kg' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'packages.*.special_handling_notes' => ['nullable', 'string', 'max:2000'],
            'packages.*.reception_result' => ['nullable', Rule::in(['received', 'rejected'])],
            'packages.*.exception_code' => ['nullable', 'string', 'max:64'],
            'packages.*.exception_notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $idempotencyKey = trim((string) $request->header('Idempotency-Key'));
        if ($idempotencyKey === '' || mb_strlen($idempotencyKey) > 191) {
            return response()->json([
                'message' => 'Se requiere un encabezado Idempotency-Key válido.',
                'errors' => ['idempotency_key' => ['Use una llave única de máximo 191 caracteres.']],
            ], 422);
        }

        $pickupRequest = $service->execute(
            'user:'.$request->user()->getAuthIdentifier(),
            $idempotencyKey,
            $payload,
            $request->user(),
        );

        return response()->json(['data' => $pickupRequest], 201);
    }

    public function store(Request $request, CreatePickupRequest $creator): JsonResponse
    {
        $payload = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:clients,id'],
            'source' => ['required', Rule::in(['admin', 'client_portal', 'hub_walk_in', 'api'])],
            'intake_mode' => ['required', Rule::enum(IntakeMode::class)],
            'service_location_id' => [
                Rule::requiredIf(fn () => in_array($request->input('intake_mode'), [
                    IntakeMode::PLANNED_DROPOFF_AT_HUB->value,
                    IntakeMode::WALK_IN_AT_HUB->value,
                ], true)),
                'nullable',
                'integer',
                'exists:service_locations,id',
            ],
            'planned_dropoff_at' => [
                Rule::requiredIf(fn () => $request->input('intake_mode') === IntakeMode::PLANNED_DROPOFF_AT_HUB->value),
                'nullable',
                'date',
            ],
            'pickup_address_line1' => [
                Rule::requiredIf(fn () => $request->input('intake_mode') === IntakeMode::PICKUP_AT_CLIENT_LOCATION->value),
                'nullable',
                'string',
                'max:200',
            ],
            'pickup_address_complement' => ['nullable', 'string', 'max:120'],
            'pickup_zone' => ['nullable', 'string', 'max:60'],
            'pickup_city' => ['nullable', 'string', 'max:60'],
            'pickup_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'pickup_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'contact_name' => ['required', 'string', 'max:120'],
            'contact_phone' => ['required', 'string', 'max:24'],
            'pickup_window_code' => ['nullable', 'string', 'max:40'],
            'pickup_window_label' => ['nullable', 'string', 'max:120'],
            'special_instructions' => ['nullable', 'string', 'max:2000'],
            'packages' => ['required', 'array', 'min:1', 'max:100'],
            'packages.*.recipient_name' => ['required', 'string', 'max:120'],
            'packages.*.recipient_phone' => ['required', 'string', 'max:24'],
            'packages.*.delivery_address_line1' => ['required', 'string', 'max:200'],
            'packages.*.delivery_address_complement' => ['nullable', 'string', 'max:120'],
            'packages.*.delivery_zone' => ['nullable', 'string', 'max:60'],
            'packages.*.delivery_city' => ['nullable', 'string', 'max:60'],
            'packages.*.delivery_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'packages.*.delivery_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'packages.*.is_cod' => ['sometimes', 'boolean'],
            'packages.*.requested_cod_amount' => ['nullable', 'integer', 'min:0', 'max:50000000'],
            'packages.*.is_fragile' => ['sometimes', 'boolean'],
            'packages.*.package_type' => ['nullable', 'string', 'max:60'],
            'packages.*.size_code' => ['nullable', 'string', 'max:40'],
            'packages.*.approx_weight_kg' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'packages.*.special_handling_notes' => ['nullable', 'string', 'max:2000'],
            'packages.*.guide_number' => ['nullable', 'string', 'max:40'],
            'packages.*.qr_reference' => ['nullable', 'string', 'max:120'],
        ]);

        $user = $request->user();
        if ($user->client_id !== null) {
            abort_unless((int) $payload['customer_id'] === (int) $user->client_id, 403, 'No puede crear recogidas para otro cliente.');
            abort_if(
                $payload['intake_mode'] === IntakeMode::WALK_IN_AT_HUB->value,
                403,
                'El ingreso espontáneo solo puede registrarlo el personal de la sede.',
            );
            $payload['source'] = 'client_portal';
        }

        $idempotencyKey = trim((string) $request->header('Idempotency-Key'));
        if ($idempotencyKey === '' || mb_strlen($idempotencyKey) > 191) {
            return response()->json([
                'message' => 'Se requiere un encabezado Idempotency-Key válido.',
                'errors' => ['idempotency_key' => ['Use una llave única de máximo 191 caracteres.']],
            ], 422);
        }

        $pickupRequest = $creator->execute(
            'user:'.$user->getAuthIdentifier(),
            $idempotencyKey,
            $payload,
        );

        return response()->json(['data' => $pickupRequest], 201);
    }
}
