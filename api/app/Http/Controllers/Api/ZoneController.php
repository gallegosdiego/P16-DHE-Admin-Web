<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shared\Models\PricingRule;
use App\Domain\Shared\Models\Zone;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ZoneController extends Controller
{
    /**
     * Listar zonas con sus tarifas activas.
     *
     * GET /api/zones?active=1
     */
    public function index(Request $request): JsonResponse
    {
        $query = Zone::with(['pricingRules' => fn ($q) => $q->where('is_active', true)])
            ->orderBy('sort_order')
            ->orderBy('name');

        if ($request->boolean('active', false)) {
            $query->active();
        }

        $zones = $query->get()->map(fn (Zone $z) => [
            'id' => $z->id,
            'name' => $z->name,
            'slug' => $z->slug,
            'city' => $z->city,
            'type' => $z->type,
            'is_active' => $z->is_active,
            'sort_order' => $z->sort_order,
            'description' => $z->description,
            'bounds' => $z->lat_min ? [
                'lat_min' => $z->lat_min,
                'lat_max' => $z->lat_max,
                'lng_min' => $z->lng_min,
                'lng_max' => $z->lng_max,
            ] : null,
            'active_rules_count' => $z->pricingRules->count(),
            'base_price' => $z->pricingRules->first()?->base_price ?? 10000,
        ]);

        return response()->json($zones);
    }

    /**
     * Crear zona.
     *
     * POST /api/zones
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:80',
            'city' => 'string|max:60',
            'type' => 'in:urban,suburban,extended',
            'is_active' => 'boolean',
            'sort_order' => 'integer|min:0',
            'description' => 'nullable|string|max:500',
            'lat_min' => 'nullable|numeric',
            'lat_max' => 'nullable|numeric',
            'lng_min' => 'nullable|numeric',
            'lng_max' => 'nullable|numeric',
        ]);

        $zone = Zone::create($data);

        return response()->json($zone, 201);
    }

    /**
     * Ver zona con todas sus tarifas.
     *
     * GET /api/zones/{zone}
     */
    public function show(Zone $zone): JsonResponse
    {
        $zone->load('pricingRules');

        return response()->json([
            'zone' => $zone,
            'pricing_rules' => $zone->pricingRules->map(fn (PricingRule $r) => [
                'id' => $r->id,
                'name' => $r->name,
                'type' => $r->type,
                'base_price' => $r->base_price,
                'per_kg_price' => $r->per_kg_price,
                'per_km_price' => $r->per_km_price,
                'min_price' => $r->min_price,
                'max_weight_kg' => $r->max_weight_kg,
                'is_active' => $r->is_active,
                'priority' => $r->priority,
            ]),
        ]);
    }

    /**
     * Actualizar zona.
     *
     * PUT /api/zones/{zone}
     */
    public function update(Request $request, Zone $zone): JsonResponse
    {
        $data = $request->validate([
            'name' => 'string|max:80',
            'city' => 'string|max:60',
            'type' => 'in:urban,suburban,extended',
            'is_active' => 'boolean',
            'sort_order' => 'integer|min:0',
            'description' => 'nullable|string|max:500',
            'lat_min' => 'nullable|numeric',
            'lat_max' => 'nullable|numeric',
            'lng_min' => 'nullable|numeric',
            'lng_max' => 'nullable|numeric',
        ]);

        $zone->update($data);

        return response()->json($zone->fresh());
    }

    /**
     * Calcular tarifa para una zona.
     *
     * POST /api/zones/{zone}/calculate
     */
    public function calculatePrice(Request $request, Zone $zone): JsonResponse
    {
        $data = $request->validate([
            'weight_kg' => 'numeric|min:0',
            'distance_km' => 'numeric|min:0',
        ]);

        $price = $zone->calculatePrice(
            $data['weight_kg'] ?? 0,
            $data['distance_km'] ?? 0,
        );

        $rule = $zone->activeRule();

        return response()->json([
            'zone' => $zone->name,
            'calculated_price' => $price,
            'rule_applied' => $rule ? [
                'name' => $rule->name,
                'type' => $rule->type,
                'base_price' => $rule->base_price,
            ] : null,
            'formatted' => '$' . number_format($price, 0, ',', '.'),
        ]);
    }

    // ── Pricing Rules (anidadas bajo zona) ──────────

    /**
     * Crear regla de tarifa para zona.
     *
     * POST /api/zones/{zone}/pricing-rules
     */
    public function storePricingRule(Request $request, Zone $zone): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'type' => 'in:flat,per_kg,per_km,surge',
            'base_price' => 'required|integer|min:0',
            'per_kg_price' => 'integer|min:0',
            'per_km_price' => 'integer|min:0',
            'min_price' => 'integer|min:0',
            'max_weight_kg' => 'numeric|min:0',
            'is_active' => 'boolean',
            'priority' => 'integer|min:0',
            'notes' => 'nullable|string|max:500',
        ]);

        $data['zone_id'] = $zone->id;
        $rule = PricingRule::create($data);

        return response()->json($rule, 201);
    }

    /**
     * Actualizar regla de tarifa.
     *
     * PUT /api/pricing-rules/{pricingRule}
     */
    public function updatePricingRule(Request $request, PricingRule $pricingRule): JsonResponse
    {
        $data = $request->validate([
            'name' => 'string|max:100',
            'type' => 'in:flat,per_kg,per_km,surge',
            'base_price' => 'integer|min:0',
            'per_kg_price' => 'integer|min:0',
            'per_km_price' => 'integer|min:0',
            'min_price' => 'integer|min:0',
            'max_weight_kg' => 'numeric|min:0',
            'is_active' => 'boolean',
            'priority' => 'integer|min:0',
            'notes' => 'nullable|string|max:500',
        ]);

        $pricingRule->update($data);

        return response()->json($pricingRule->fresh());
    }
}
