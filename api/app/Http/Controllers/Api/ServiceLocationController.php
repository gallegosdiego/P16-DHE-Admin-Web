<?php

namespace App\Http\Controllers\Api;

use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Shared\Models\AuditLog;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Str;

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
        if ($request->filled('code')) {
            $request->merge(['code' => Str::upper(trim((string) $request->input('code')))]);
        }

        $validated = $request->validate([
            'code' => ['nullable', 'string', 'max:40', Rule::unique('service_locations', 'code')->ignore($location)],
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

        if ($location !== null && blank($validated['code'] ?? null)) {
            $validated['code'] = $location->code;
        } elseif (blank($validated['code'] ?? null)) {
            $validated['code'] = $this->nextCode(
                (string) $validated['name'],
                (string) ($validated['location_type'] ?? 'danhei_hub'),
            );
        } else {
            $validated['code'] = Str::upper(trim((string) $validated['code']));
        }

        return $validated;
    }

    private function nextCode(string $name, string $locationType): string
    {
        $slug = (string) preg_replace('/[^A-Z0-9]+/', '-', Str::upper(Str::ascii($name)));
        $slug = trim($slug, '-');
        $slug = $slug !== '' ? $slug : 'SEDE';
        $prefix = $locationType === 'partner_point' ? 'PTO' : 'HUB';
        $base = substr($prefix.'-'.$slug, 0, 40);
        $code = $base;
        $suffix = 2;

        while (ServiceLocation::query()->where('code', $code)->exists()) {
            $tail = '-'.$suffix;
            $code = substr($base, 0, 40 - strlen($tail)).$tail;
            $suffix++;
        }

        return $code;
    }
}
