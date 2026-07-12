<?php

namespace App\Http\Controllers\Api;

use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Shared\Models\AuditLog;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ServiceLocationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $locations = ServiceLocation::query()
            ->when(! $request->boolean('include_inactive'), fn ($query) => $query->where('is_active', true))
            ->orderBy('city')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $locations]);
    }

    public function store(Request $request): JsonResponse
    {
        $location = ServiceLocation::query()->create($this->validated($request));
        AuditLog::log('operations.location_created', $location, null, $location->toArray(), 'Sede operativa creada.');

        return response()->json(['data' => $location], 201);
    }

    public function update(Request $request, ServiceLocation $serviceLocation): JsonResponse
    {
        $oldValues = $serviceLocation->toArray();
        $serviceLocation->update($this->validated($request, $serviceLocation));
        AuditLog::log('operations.location_updated', $serviceLocation, $oldValues, $serviceLocation->toArray(), 'Sede operativa actualizada.');

        return response()->json(['data' => $serviceLocation->refresh()]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?ServiceLocation $location = null): array
    {
        return $request->validate([
            'code' => ['required', 'string', 'max:40', Rule::unique('service_locations', 'code')->ignore($location)],
            'name' => ['required', 'string', 'max:120'],
            'location_type' => ['sometimes', Rule::in(['danhei_hub', 'partner_point'])],
            'address_line1' => ['required', 'string', 'max:200'],
            'address_complement' => ['nullable', 'string', 'max:120'],
            'zone' => ['nullable', 'string', 'max:60'],
            'city' => ['sometimes', 'string', 'max:60'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
            'timezone' => ['sometimes', 'timezone'],
            'opening_hours_json' => ['nullable', 'array'],
            'capabilities_json' => ['nullable', 'array'],
            'contact_name' => ['nullable', 'string', 'max:120'],
            'contact_phone' => ['nullable', 'string', 'max:24'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}
