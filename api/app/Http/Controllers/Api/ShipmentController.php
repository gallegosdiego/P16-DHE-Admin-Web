<?php

namespace App\Http\Controllers\Api;

use App\Domain\Financial\Enums\FinancialStatus;
use App\Domain\Shipment\Actions\CreateShipment;
use App\Domain\Shipment\Actions\TransitionShipmentStatus;
use App\Domain\Shipment\Enums\PaymentType;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Services\GeocodingService;
use App\Domain\Shipment\Services\ShipmentGeodataService;
use App\Http\Controllers\Controller;
use App\Support\ShipmentEvidenceStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ShipmentController extends Controller
{
    private const STRUCTURED_ROAD_TYPES = [
        'calle',
        'carrera',
        'diagonal',
        'transversal',
        'avenida',
        'autopista',
        'circular',
        'via',
        'vereda',
    ];

    /**
     * Lista de envíos con filtros y paginación.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'string'],
            'driver_id' => ['nullable', 'integer'],
            'client_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:120'],
            'financial_status' => ['nullable', 'string'],
            'payment_type' => ['nullable', 'string'],
            'has_coordinates' => ['nullable', 'boolean'],
            'needs_geocoding' => ['nullable', 'boolean'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Shipment::with(['client:id,name,phone', 'driver:id,name,initials,phone']);

        // Filtros
        if ($status = ($filters['status'] ?? null)) {
            $query->where('status', $status);
        }
        if ($driver = ($filters['driver_id'] ?? null)) {
            $query->where('driver_id', $driver);
        }
        if ($client = ($filters['client_id'] ?? null)) {
            $query->where('client_id', $client);
        }
        if ($search = ($filters['search'] ?? null)) {
            $query->where(function ($q) use ($search) {
                $q->where('display_code', 'like', "%{$search}%")
                  ->orWhere('tracking_code', 'like', "%{$search}%")
                  ->orWhere('recipient_name', 'like', "%{$search}%")
                  ->orWhere('recipient_phone', 'like', "%{$search}%")
                  ->orWhere('recipient_address', 'like', "%{$search}%")
                  ->orWhereHas('client', fn ($q) => $q->where('name', 'like', "%{$search}%"));
            });
        }
        if ($financialStatus = ($filters['financial_status'] ?? null)) {
            $query->where('financial_status', $financialStatus);
        }
        if ($paymentType = ($filters['payment_type'] ?? null)) {
            $query->where('payment_type', $paymentType);
        }
        if (array_key_exists('has_coordinates', $filters)) {
            $request->boolean('has_coordinates')
                ? $query->withCoordinates()
                : $query->withoutCoordinates();
        }
        if ($request->boolean('needs_geocoding')) {
            $query->pendingGeocoding();
        }
        if ($dateFrom = ($filters['date_from'] ?? null)) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }
        if ($dateTo = ($filters['date_to'] ?? null)) {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        $shipments = $query->orderByDesc('created_at')
            ->paginate((int) ($filters['per_page'] ?? 25));

        return response()->json($shipments);
    }

    public function geoSummary(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'string'],
            'driver_id' => ['nullable', 'integer'],
            'client_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:120'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'sample_limit' => ['nullable', 'integer', 'min:1', 'max:25'],
        ]);

        $query = Shipment::query()->with(['driver:id,name,initials']);

        if ($status = ($filters['status'] ?? null)) {
            $query->where('status', $status);
        }
        if ($driver = ($filters['driver_id'] ?? null)) {
            $query->where('driver_id', $driver);
        }
        if ($client = ($filters['client_id'] ?? null)) {
            $query->where('client_id', $client);
        }
        if ($search = ($filters['search'] ?? null)) {
            $query->where(function ($q) use ($search) {
                $q->where('display_code', 'like', "%{$search}%")
                    ->orWhere('tracking_code', 'like', "%{$search}%")
                    ->orWhere('recipient_name', 'like', "%{$search}%")
                    ->orWhere('recipient_phone', 'like', "%{$search}%")
                    ->orWhere('recipient_address', 'like', "%{$search}%")
                    ->orWhereHas('client', fn ($clientQuery) => $clientQuery->where('name', 'like', "%{$search}%"));
            });
        }
        if ($dateFrom = ($filters['date_from'] ?? null)) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }
        if ($dateTo = ($filters['date_to'] ?? null)) {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        $sampleLimit = (int) ($filters['sample_limit'] ?? 10);

        $total = (clone $query)->count();
        $withCoordinates = (clone $query)->withCoordinates()->count();
        $withoutCoordinates = (clone $query)->withoutCoordinates()->count();
        $pendingGeocoding = (clone $query)->pendingGeocoding()->count();
        $recentMissing = (clone $query)
            ->withoutCoordinates()
            ->orderByDesc('created_at')
            ->limit($sampleLimit)
            ->get([
                'id',
                'display_code',
                'tracking_code',
                'driver_id',
                'status',
                'recipient_name',
                'recipient_address',
                'recipient_zone',
                'recipient_city',
                'recipient_lat',
                'recipient_lng',
                'geocoded_at',
                'created_at',
            ]);

        return response()->json([
            'summary' => [
                'total' => $total,
                'with_coordinates' => $withCoordinates,
                'without_coordinates' => $withoutCoordinates,
                'pending_geocoding' => $pendingGeocoding,
                'coverage_percent' => $total > 0 ? round(($withCoordinates / $total) * 100, 1) : 100.0,
            ],
            'recent_missing' => $recentMissing,
        ]);
    }

    public function repairGeodata(Request $request, ShipmentGeodataService $geodataService): JsonResponse
    {
        $validated = $request->validate([
            'shipment_ids' => ['required', 'array', 'min:1', 'max:25'],
            'shipment_ids.*' => ['integer', 'exists:shipments,id'],
        ]);

        $shipments = Shipment::query()
            ->whereIn('id', $validated['shipment_ids'])
            ->get();

        $repaired = 0;
        $alreadyReady = 0;
        $cityResolved = 0;
        $stillMissing = 0;
        $results = [];

        foreach ($shipments as $shipment) {
            $hadCoordinates = $shipment->hasRecipientCoordinates();
            $report = $geodataService->repair($shipment);

            if ($shipment->isDirty()) {
                $shipment->save();
            }

            $shipment->refresh();
            $hasCoordinates = $shipment->hasRecipientCoordinates();

            if (! $hadCoordinates && $hasCoordinates) {
                $repaired++;
            } elseif ($hadCoordinates) {
                $alreadyReady++;
            } else {
                $stillMissing++;
            }

            if ($report['city_resolved']) {
                $cityResolved++;
            }

            $results[] = [
                'id' => $shipment->id,
                'display_code' => $shipment->display_code,
                'recipient_city' => $shipment->recipient_city,
                'recipient_zone' => $shipment->recipient_zone,
                'recipient_lat' => $shipment->recipient_lat,
                'recipient_lng' => $shipment->recipient_lng,
                'has_coordinates' => $hasCoordinates,
                'geocoding_pending' => $shipment->geocodingPending(),
                'geocoding_status' => $shipment->geocodingStatus(),
                'geocoding_reason' => $shipment->geocodingReason(),
                'geocoding_reason_label' => $shipment->getGeocodingReasonLabelAttribute(),
            ];
        }

        return response()->json([
            'message' => $repaired > 0
                ? "Se repararon {$repaired} pedido(s) con coordenadas nuevas."
                : 'No se obtuvieron coordenadas nuevas en este intento.',
            'summary' => [
                'processed' => $shipments->count(),
                'repaired' => $repaired,
                'already_ready' => $alreadyReady,
                'city_resolved' => $cityResolved,
                'still_missing' => $stillMissing,
            ],
            'shipments' => $results,
        ]);
    }

    /**
     * Detalle de un envío con timeline.
     */
    public function addressPreview(
        Request $request,
        ShipmentGeodataService $geodataService,
        GeocodingService $geocodingService
    ): JsonResponse {
        $validated = $request->validate([
            'recipient_address' => ['required', 'string', 'max:200'],
            'recipient_zone' => ['nullable', 'string', 'max:60'],
            'recipient_city' => ['nullable', 'string', 'max:60'],
            'address_mode' => ['nullable', 'in:structured,manual'],
            'address_road_type' => ['nullable', 'in:'.implode(',', self::STRUCTURED_ROAD_TYPES)],
            'address_road_number' => ['nullable', 'string', 'max:20'],
            'address_road_suffix' => ['nullable', 'string', 'max:20'],
            'address_cross_number' => ['nullable', 'string', 'max:20'],
            'address_cross_suffix' => ['nullable', 'string', 'max:20'],
            'address_property_number' => ['nullable', 'string', 'max:20'],
            'address_property_suffix' => ['nullable', 'string', 'max:20'],
            'address_unit_details' => ['nullable', 'string', 'max:80'],
            'address_neighborhood' => ['nullable', 'string', 'max:80'],
            'address_reference' => ['nullable', 'string', 'max:160'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:5'],
        ]);

        $validated = $this->normalizeRecipientLocationPayload($validated);
        $address = trim((string) ($validated['recipient_address'] ?? ''));
        $city = $validated['recipient_city'] ?? null;
        $zone = $validated['recipient_zone'] ?? null;

        if ($address === '' || mb_strlen($address) < 5) {
            return response()->json([
                'address' => $address,
                'city' => $city,
                'zone' => $zone,
                'recipient_lat' => null,
                'recipient_lng' => null,
                'has_coordinates' => false,
                'geocoding_pending' => false,
                'candidates' => [],
                'message' => 'Completa una dirección más precisa para previsualizarla.',
            ]);
        }

        $probe = new Shipment([
            'recipient_address' => $address,
            'recipient_city' => $city,
            'recipient_zone' => $zone,
        ]);

        $repair = $geodataService->repair($probe);
        $candidates = filled($probe->recipient_city)
            ? $geocodingService->searchCandidates(
                $probe->recipient_address ?? '',
                $probe->recipient_city ?? '',
                $probe->recipient_zone,
                (int) ($validated['limit'] ?? 4),
            )
            : [];

        if ($candidates === [] && $probe->hasRecipientCoordinates()) {
            $candidates[] = [
                'label' => $probe->recipient_address,
                'formatted_address' => $probe->recipient_address,
                'lat' => (float) $probe->recipient_lat,
                'lng' => (float) $probe->recipient_lng,
                'provider' => $repair['geocoded'] ? 'geocoder' : 'fallback',
                'query' => $probe->recipient_address,
            ];
        }

        return response()->json([
            'address' => $probe->recipient_address,
            'city' => $probe->recipient_city,
            'zone' => $probe->recipient_zone,
            'recipient_lat' => $probe->recipient_lat,
            'recipient_lng' => $probe->recipient_lng,
            'has_coordinates' => $probe->hasRecipientCoordinates(),
            'geocoding_pending' => $probe->geocodingPending(),
            'candidates' => $candidates,
            'message' => $probe->hasRecipientCoordinates()
                ? 'Dirección previsualizada correctamente.'
                : 'La dirección aún necesita más precisión o una zona de apoyo.',
        ]);
    }

    public function show(Shipment $shipment): JsonResponse
    {
        $shipment->load(['client', 'driver', 'events.user:id,name', 'createdBy:id,name']);

        return response()->json($shipment);
    }

    /**
     * Crear nuevo envío.
     */
    public function store(Request $request, CreateShipment $action): JsonResponse
    {
        $validated = $request->validate([
            'client_id' => ['required', 'exists:clients,id'],
            'driver_id' => ['nullable', 'exists:drivers,id'],
            'recipient_name' => ['required', 'string', 'max:100'],
            'recipient_phone' => ['required', 'string', 'max:24'],
            'recipient_address' => ['required', 'string', 'max:200'],
            'recipient_zone' => ['nullable', 'string', 'max:60'],
            'recipient_city' => ['nullable', 'string', 'max:60'],
            'address_mode' => ['nullable', 'in:structured,manual'],
            'address_road_type' => ['nullable', 'in:'.implode(',', self::STRUCTURED_ROAD_TYPES)],
            'address_road_number' => ['nullable', 'string', 'max:20'],
            'address_road_suffix' => ['nullable', 'string', 'max:20'],
            'address_cross_number' => ['nullable', 'string', 'max:20'],
            'address_cross_suffix' => ['nullable', 'string', 'max:20'],
            'address_property_number' => ['nullable', 'string', 'max:20'],
            'address_property_suffix' => ['nullable', 'string', 'max:20'],
            'address_unit_details' => ['nullable', 'string', 'max:80'],
            'address_neighborhood' => ['nullable', 'string', 'max:80'],
            'address_reference' => ['nullable', 'string', 'max:160'],
            'recipient_lat' => ['nullable', 'numeric', 'between:-90,90', 'required_with:recipient_lng'],
            'recipient_lng' => ['nullable', 'numeric', 'between:-180,180', 'required_with:recipient_lat'],
            'delivery_instructions' => ['nullable', 'string', 'max:500'],
            'payment_type' => ['required', 'in:cash_on_delivery,post_sale,prepaid,mercado_libre'],
            'shipping_cost' => ['required', 'integer', 'min:0'],
            'cod_amount' => ['nullable', 'integer', 'min:0'],
            'driver_fee' => ['nullable', 'integer', 'min:0'],
            'is_outsourced' => ['nullable', 'boolean'],
            'outsource_company' => ['nullable', 'string', 'max:100'],
            'outsource_amount' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
            'intake_photo' => ['nullable', 'image', 'mimes:jpeg,png,jpg,webp', 'max:5120'],
        ]);

        $validated = $this->normalizeRecipientLocationPayload($validated);
        $this->validateRecipientLocationPayload($validated);
        $validated = $this->normalizePaymentAmounts($validated);
        $validated = $this->sanitizeOptionalShipmentColumns($validated);
        $shipment = $action->execute(
            collect($validated)->except([
                'intake_photo',
                'address_mode',
                'address_road_type',
                'address_road_number',
                'address_road_suffix',
                'address_cross_number',
                'address_cross_suffix',
                'address_property_number',
                'address_property_suffix',
                'address_unit_details',
                'address_neighborhood',
                'address_reference',
            ])->toArray(),
            $request->user()
        );

        if ($request->hasFile('intake_photo')) {
            $path = $request->file('intake_photo')->store('intake', 'public');
            $shipment->update(['intake_photo' => $path]);
        }

        return response()->json($shipment, 201);
    }

    /**
     * Actualizar datos del envío (no estado).
     */
    public function update(Request $request, Shipment $shipment): JsonResponse
    {
        $validated = $request->validate([
            'driver_id' => ['nullable', 'exists:drivers,id'],
            'recipient_name' => ['sometimes', 'string', 'max:100'],
            'recipient_phone' => ['sometimes', 'string', 'max:24'],
            'recipient_address' => ['sometimes', 'string', 'max:200'],
            'recipient_zone' => ['nullable', 'string', 'max:60'],
            'recipient_city' => ['nullable', 'string', 'max:60'],
            'address_mode' => ['nullable', 'in:structured,manual'],
            'address_road_type' => ['nullable', 'in:'.implode(',', self::STRUCTURED_ROAD_TYPES)],
            'address_road_number' => ['nullable', 'string', 'max:20'],
            'address_road_suffix' => ['nullable', 'string', 'max:20'],
            'address_cross_number' => ['nullable', 'string', 'max:20'],
            'address_cross_suffix' => ['nullable', 'string', 'max:20'],
            'address_property_number' => ['nullable', 'string', 'max:20'],
            'address_property_suffix' => ['nullable', 'string', 'max:20'],
            'address_unit_details' => ['nullable', 'string', 'max:80'],
            'address_neighborhood' => ['nullable', 'string', 'max:80'],
            'address_reference' => ['nullable', 'string', 'max:160'],
            'recipient_lat' => ['nullable', 'numeric', 'between:-90,90', 'required_with:recipient_lng'],
            'recipient_lng' => ['nullable', 'numeric', 'between:-180,180', 'required_with:recipient_lat'],
            'delivery_instructions' => ['nullable', 'string', 'max:500'],
            'payment_type' => ['sometimes', 'in:cash_on_delivery,post_sale,prepaid,mercado_libre'],
            'shipping_cost' => ['sometimes', 'integer', 'min:0'],
            'cod_amount' => ['nullable', 'integer', 'min:0'],
            'driver_fee' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
            'intake_photo' => ['nullable', 'image', 'mimes:jpeg,png,jpg,webp', 'max:5120'],
        ]);

        if (
            array_key_exists('recipient_address', $validated)
            || array_key_exists('recipient_city', $validated)
            || array_key_exists('recipient_zone', $validated)
        ) {
            $validated = $this->normalizeRecipientLocationPayload($validated, $shipment);
            $this->validateRecipientLocationPayload($validated);
        }

        $validated = $this->normalizePaymentAmounts($validated);
        $validated = $this->sanitizeOptionalShipmentColumns($validated);

        $shipment->update(collect($validated)->except([
            'intake_photo',
            'address_mode',
            'address_road_type',
            'address_road_number',
            'address_road_suffix',
            'address_cross_number',
            'address_cross_suffix',
            'address_property_number',
            'address_property_suffix',
            'address_unit_details',
            'address_neighborhood',
            'address_reference',
        ])->toArray());

        if ($request->hasFile('intake_photo')) {
            $path = $request->file('intake_photo')->store('intake', 'public');
            $shipment->update(['intake_photo' => $path]);
        }

        return response()->json($shipment->fresh(['client', 'driver']));
    }

    private function normalizePaymentAmounts(array $data): array
    {
        if (($data['payment_type'] ?? null) !== 'cash_on_delivery') {
            $data['cod_amount'] = 0;
        }

        return $data;
    }

    private function sanitizeOptionalShipmentColumns(array $data): array
    {
        if (! Shipment::supportsRecipientAddressMetaField()) {
            unset($data['recipient_address_meta']);
        }

        if (! Shipment::supportsCoordinateFields()) {
            unset($data['recipient_lat'], $data['recipient_lng']);
        }

        if (! Shipment::supportsGeocodedAtField()) {
            unset($data['geocoded_at']);
        }

        if (! Shipment::supportsCodCollectionFields()) {
            unset($data['cod_collected_amount'], $data['cod_payment_method'], $data['cod_collected_at']);
        }

        if (! Shipment::supportsEvidencePhotoField()) {
            unset($data['evidence_photo']);
        }

        if (! Shipment::supportsEvidenceReceiverField()) {
            unset($data['evidence_receiver_name']);
        }

        return $data;
    }

    private function normalizeRecipientLocationPayload(array $data, ?Shipment $shipment = null): array
    {
        $structuredMeta = $this->extractStructuredAddressMeta($data, $shipment);

        if ($structuredMeta !== null) {
            $data['recipient_address'] = $this->composeStructuredRecipientAddress($structuredMeta);
            $data['recipient_address_meta'] = $structuredMeta;
        } elseif (($data['address_mode'] ?? null) === 'manual') {
            $data['recipient_address_meta'] = null;
        }

        $address = array_key_exists('recipient_address', $data)
            ? $data['recipient_address']
            : $shipment?->recipient_address;
        $city = array_key_exists('recipient_city', $data)
            ? $data['recipient_city']
            : $shipment?->recipient_city;
        $zone = array_key_exists('recipient_zone', $data)
            ? $data['recipient_zone']
            : $shipment?->recipient_zone;

        $probeShipment = new Shipment([
            'recipient_address' => is_string($address) ? $address : null,
            'recipient_city' => is_string($city) ? $city : null,
            'recipient_zone' => is_string($zone) ? $zone : null,
        ]);
        app(ShipmentGeodataService::class)->applyRecipientZoneFallbackFromAddress($probeShipment);

        $normalized = app(GeocodingService::class)->normalizeLocationInput(
            is_string($address) ? $address : null,
            is_string($city) ? $city : ($probeShipment->recipient_city ?: null),
            is_string($zone) ? $zone : ($probeShipment->recipient_zone ?: null),
        );

        $data['recipient_address'] = $normalized['address'];
        $data['recipient_city'] = $normalized['city'];
        $data['recipient_zone'] = $normalized['zone'];

        if (isset($data['recipient_address_meta']) && is_array($data['recipient_address_meta'])) {
            $data['recipient_address_meta']['formatted_address'] = $data['recipient_address'];
            $data['recipient_address_meta']['zone'] = $data['recipient_zone'];
            $data['recipient_address_meta']['city'] = $data['recipient_city'];
        }

        return $data;
    }

    private function validateRecipientLocationPayload(array $data): void
    {
        $address = trim((string) ($data['recipient_address'] ?? ''));
        $hasManualCoordinates = is_numeric($data['recipient_lat'] ?? null)
            && is_numeric($data['recipient_lng'] ?? null);

        if ($address === '') {
            throw ValidationException::withMessages([
                'recipient_address' => 'La dirección de entrega es obligatoria.',
            ]);
        }

        if ($hasManualCoordinates) {
            return;
        }

        if (mb_strlen($address) < 8) {
            throw ValidationException::withMessages([
                'recipient_address' => 'La dirección es demasiado corta. Agrega calle/carrera y numeración o una referencia más precisa.',
            ]);
        }

        if (
            ! $this->addressHasLocatableReference($address)
            && ! filled($data['recipient_zone'] ?? null)
        ) {
            throw ValidationException::withMessages([
                'recipient_address' => 'La dirección no tiene una referencia ubicable. Agrega numeración, kilómetro, vereda o define una zona válida para apoyar la geolocalización.',
            ]);
        }
    }

    private function addressHasLocatableReference(string $address): bool
    {
        if (preg_match('/\d/', $address) === 1) {
            return true;
        }

        return preg_match('/\b(km|kilometro|kilómetro|vereda|via|vía|finca|lote|manzana|etapa|sector|barrio|parcela|parcelacion|parcelación)\b/i', $address) === 1;
    }

    private function extractStructuredAddressMeta(array $data, ?Shipment $shipment = null): ?array
    {
        $fields = [
            'road_type' => $data['address_road_type'] ?? data_get($shipment?->recipient_address_meta, 'road_type'),
            'road_number' => $data['address_road_number'] ?? data_get($shipment?->recipient_address_meta, 'road_number'),
            'road_suffix' => $data['address_road_suffix'] ?? data_get($shipment?->recipient_address_meta, 'road_suffix'),
            'cross_number' => $data['address_cross_number'] ?? data_get($shipment?->recipient_address_meta, 'cross_number'),
            'cross_suffix' => $data['address_cross_suffix'] ?? data_get($shipment?->recipient_address_meta, 'cross_suffix'),
            'property_number' => $data['address_property_number'] ?? data_get($shipment?->recipient_address_meta, 'property_number'),
            'property_suffix' => $data['address_property_suffix'] ?? data_get($shipment?->recipient_address_meta, 'property_suffix'),
            'unit_details' => $data['address_unit_details'] ?? data_get($shipment?->recipient_address_meta, 'unit_details'),
            'neighborhood' => $data['address_neighborhood'] ?? data_get($shipment?->recipient_address_meta, 'neighborhood'),
            'reference' => $data['address_reference'] ?? data_get($shipment?->recipient_address_meta, 'reference'),
        ];

        $mode = (string) ($data['address_mode'] ?? data_get($shipment?->recipient_address_meta, 'mode') ?? '');
        $hasStructuredData = collect($fields)->contains(fn ($value) => filled((string) $value));

        if (! $hasStructuredData && $mode !== 'structured') {
            return null;
        }

        $meta = [
            'mode' => 'structured',
            'road_type' => $this->normalizeRoadType($fields['road_type']),
            'road_number' => $this->normalizeAddressToken($fields['road_number']),
            'road_suffix' => $this->normalizeAddressSuffix($fields['road_suffix']),
            'cross_number' => $this->normalizeAddressToken($fields['cross_number']),
            'cross_suffix' => $this->normalizeAddressSuffix($fields['cross_suffix']),
            'property_number' => $this->normalizeAddressToken($fields['property_number']),
            'property_suffix' => $this->normalizeAddressSuffix($fields['property_suffix']),
            'unit_details' => $this->normalizeAddressFreeText($fields['unit_details']),
            'neighborhood' => $this->normalizeAddressFreeText($fields['neighborhood']),
            'reference' => $this->normalizeAddressFreeText($fields['reference']),
            'source' => 'address_builder_v1',
        ];

        if (! filled($meta['road_type']) || ! filled($meta['road_number']) || ! filled($meta['cross_number']) || ! filled($meta['property_number'])) {
            return null;
        }

        return $meta;
    }

    private function composeStructuredRecipientAddress(array $meta): string
    {
        $roadType = $this->displayRoadType((string) ($meta['road_type'] ?? ''));
        $roadNumber = trim(implode(' ', array_filter([
            $meta['road_number'] ?? null,
            $meta['road_suffix'] ?? null,
        ], fn ($value) => filled((string) $value))));
        $crossNumber = trim(implode(' ', array_filter([
            $meta['cross_number'] ?? null,
            $meta['cross_suffix'] ?? null,
        ], fn ($value) => filled((string) $value))));
        $propertyNumber = trim(implode(' ', array_filter([
            $meta['property_number'] ?? null,
            $meta['property_suffix'] ?? null,
        ], fn ($value) => filled((string) $value))));

        $base = trim(sprintf('%s %s # %s-%s', $roadType, $roadNumber, $crossNumber, $propertyNumber));

        $extras = array_filter([
            $meta['unit_details'] ?? null,
            $meta['neighborhood'] ?? null,
        ], fn ($value) => filled((string) $value));

        $address = $base;

        foreach ($extras as $extra) {
            $candidate = $address.', '.$extra;
            if (mb_strlen($candidate) <= 200) {
                $address = $candidate;
                continue;
            }

            $available = 200 - mb_strlen($address.', ');
            if ($available > 0) {
                $address .= ', '.trim((string) Str::limit((string) $extra, $available, ''));
            }
            break;
        }

        return trim((string) Str::limit($address, 200, ''));
    }

    private function normalizeRoadType(mixed $value): ?string
    {
        $token = Str::of((string) $value)->ascii()->lower()->trim()->value();

        return in_array($token, self::STRUCTURED_ROAD_TYPES, true) ? $token : null;
    }

    private function displayRoadType(string $value): string
    {
        return match ($value) {
            'calle' => 'Calle',
            'carrera' => 'Carrera',
            'diagonal' => 'Diagonal',
            'transversal' => 'Transversal',
            'avenida' => 'Avenida',
            'autopista' => 'Autopista',
            'circular' => 'Circular',
            'via' => 'Via',
            'vereda' => 'Vereda',
            default => Str::title($value),
        };
    }

    private function normalizeAddressToken(mixed $value): ?string
    {
        $normalized = Str::of((string) $value)
            ->ascii()
            ->upper()
            ->replaceMatches('/[^A-Z0-9]/', '')
            ->trim()
            ->value();

        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeAddressSuffix(mixed $value): ?string
    {
        $normalized = Str::of((string) $value)
            ->ascii()
            ->replaceMatches('/\s+/', ' ')
            ->trim(" \t\n\r\0\x0B,.-")
            ->value();

        return $normalized !== '' ? Str::title(Str::lower($normalized)) : null;
    }

    private function normalizeAddressFreeText(mixed $value): ?string
    {
        $normalized = Str::of((string) $value)
            ->ascii()
            ->replaceMatches('/\s+/', ' ')
            ->trim(" \t\n\r\0\x0B,.-")
            ->value();

        return $normalized !== '' ? Str::title(Str::lower($normalized)) : null;
    }

    private function canDeleteShipment(Shipment $shipment): bool
    {
        return in_array($this->shipmentStatusValue($shipment), [
            ShipmentStatus::REGISTERED->value,
            ShipmentStatus::CONFIRMED->value,
            ShipmentStatus::PICKUP_SCHEDULED->value,
            ShipmentStatus::PICKED_UP->value,
            ShipmentStatus::IN_WAREHOUSE->value,
            ShipmentStatus::ASSIGNED_TO_ROUTE->value,
        ], true);
    }

    private function shipmentStatusValue(Shipment $shipment): string
    {
        return $shipment->status instanceof ShipmentStatus
            ? $shipment->status->value
            : (string) $shipment->status;
    }

    private function detachRouteStopsAndRecount(Shipment $shipment): void
    {
        $shipment->loadMissing('routeStops.route');

        foreach ($shipment->routeStops as $stop) {
            $route = $stop->route;
            $stop->delete();

            if (! $route) {
                continue;
            }

            $route->update([
                'total_stops' => $route->stops()->count(),
                'completed_stops' => $route->stops()->where('status', 'completed')->count(),
            ]);
        }
    }

    /**
     * Eliminar envío (soft delete con protección operativa y financiera).
     *
     * DELETE /api/shipments/{shipment}
     */
    public function destroy(Shipment $shipment): JsonResponse
    {
        // Protección financiera: no borrar si ya fue liquidado
        if ($shipment->settlement_id || $shipment->payout_id) {
            return response()->json([
                'message' => 'No se puede eliminar: este envío ya tiene liquidación financiera asociada.',
            ], 422);
        }

        if (! $this->canDeleteShipment($shipment)) {
            return response()->json([
                'message' => 'No se puede eliminar: el envío ya está en operación o en un estado final.',
            ], 422);
        }

        DB::transaction(function () use ($shipment) {
            $this->detachRouteStopsAndRecount($shipment);
            $shipment->delete();
        });

        return response()->json(['message' => 'Envío enviado a la papelera']);
    }

    /**
     * Eliminar múltiples envíos (soft delete con protección operativa y financiera).
     *
     * POST /api/shipments/batch-delete
     */
    public function batchDestroy(Request $request): JsonResponse
    {
        $request->validate([
            'shipment_ids' => ['required', 'array', 'min:1', 'max:50'],
            'shipment_ids.*' => ['integer', 'exists:shipments,id'],
        ]);

        $results = ['deleted' => 0, 'skipped' => 0, 'errors' => []];

        foreach ($request->shipment_ids as $id) {
            $shipment = Shipment::find($id);
            if (! $shipment) {
                continue;
            }

            if ($shipment->settlement_id || $shipment->payout_id) {
                $results['skipped']++;
                $results['errors'][] = "#{$shipment->display_code}: tiene liquidación financiera";
                continue;
            }

            if (! $this->canDeleteShipment($shipment)) {
                $results['skipped']++;
                $results['errors'][] = "#{$shipment->display_code}: estado no eliminable";
                continue;
            }

            DB::transaction(function () use ($shipment) {
                $this->detachRouteStopsAndRecount($shipment);
                $shipment->delete();
            });
            $results['deleted']++;
        }

        return response()->json([
            ...$results,
            'message' => "{$results['deleted']} envíos enviados a la papelera.",
        ]);
    }

    /**
     * Cambiar estado del envío (transición validada).
     */
    public function changeStatus(Request $request, Shipment $shipment, TransitionShipmentStatus $action): JsonResponse
    {
        $shipment = $this->normalizeLegacyOperationalEnums($shipment);

        $rules = [
            'status' => ['required', 'string'],
            'description' => ['nullable', 'string', 'max:280'],
            'issue_note' => ['nullable', 'string', 'max:280'],
            'evidence_receiver_name' => ['nullable', 'string', 'max:100'],
            'cod_collected_amount' => ['nullable', 'integer', 'min:0'],
            'cod_payment_method' => ['nullable', 'string', 'max:40'],
        ];

        // Validar foto de evidencia solo si viene en el request
        if ($request->hasFile('evidence_photo')) {
            $rules['evidence_photo'] = ['image', 'mimes:jpeg,png,jpg', 'max:5120'];
        }

        $request->validate($rules);

        $newStatus = ShipmentStatus::tryFrom($request->status);

        if (! $newStatus) {
            return response()->json(['message' => 'Estado inválido.'], 422);
        }

        // Si es novedad, guardar la nota
        if ($newStatus === ShipmentStatus::ISSUE && $request->issue_note) {
            $shipment->update(['issue_note' => $request->issue_note]);
        }

        // Guardar foto de evidencia si fue enviada
        if ($request->hasFile('evidence_photo') && Shipment::supportsEvidencePhotoField()) {
            $shipment->evidence_photo = app(ShipmentEvidenceStorage::class)->store($request, $shipment);
        }

        // Guardar nombre del receptor si fue enviado
        if ($request->filled('evidence_receiver_name') && Shipment::supportsEvidenceReceiverField()) {
            $shipment->evidence_receiver_name = $request->evidence_receiver_name;
        }

        // Registrar recaudo COD enviado desde la app del piloto.
        if ($newStatus === ShipmentStatus::DELIVERED && $shipment->payment_type->value === 'cash_on_delivery') {
            $supportsCodCollectionFields = Shipment::supportsCodCollectionFields();

            if ($request->filled('cod_collected_amount')) {
                $collectedAmount = (int) $request->input('cod_collected_amount');

                if ($supportsCodCollectionFields) {
                    $shipment->cod_collected_amount = $collectedAmount;
                }

                // Si el pedido fue creado COD con monto 0, corregir el monto base para reportes existentes.
                if ((int) $shipment->cod_amount === 0 && $collectedAmount > 0) {
                    $shipment->cod_amount = $collectedAmount;
                }
            }

            if ($supportsCodCollectionFields && $request->filled('cod_payment_method')) {
                $shipment->cod_payment_method = $request->input('cod_payment_method');
            }

            if ($supportsCodCollectionFields && ($request->filled('cod_collected_amount') || $request->filled('cod_payment_method'))) {
                $shipment->cod_collected_at = now();
            }
        }

        // Persistir campos de evidencia si fueron modificados
        if ($shipment->isDirty()) {
            $shipment->save();
        }

        $currentStatus = $shipment->status instanceof ShipmentStatus
            ? $shipment->status
            : ShipmentStatus::tryFrom((string) $shipment->status);

        if ($currentStatus === $newStatus) {
            return response()->json(
                $shipment->fresh()->load(['client', 'driver', 'events'])
            );
        }

        if (
            $newStatus === ShipmentStatus::DELIVERED
            && $shipment->status === ShipmentStatus::ASSIGNED_TO_ROUTE
        ) {
            try {
                $shipment = $action->execute(
                    $shipment,
                    ShipmentStatus::IN_TRANSIT,
                    $request->user(),
                    'Ruta iniciada automáticamente al confirmar entrega.',
                );
            } catch (\InvalidArgumentException $exception) {
                return response()->json([
                    'message' => $exception->getMessage(),
                    'code' => 'invalid_transition',
                    'retryable' => false,
                ], 422);
            }
        }

        try {
            $shipment = $action->execute(
                $shipment,
                $newStatus,
                $request->user(),
                $request->description,
            );
        } catch (\InvalidArgumentException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'code' => 'invalid_transition',
                'retryable' => false,
            ], 422);
        }

        return response()->json($shipment->load(['client', 'driver', 'events']));

    }

    /**
     * Asignar conductor a un envío.
     */
    private function normalizeLegacyOperationalEnums(Shipment $shipment): Shipment
    {
        $updates = [];

        $rawStatus = (string) ($shipment->getRawOriginal('status') ?? '');
        if ($rawStatus !== '' && ! ShipmentStatus::tryFrom($rawStatus)) {
            $normalizedStatus = match ($this->canonicalLegacyEnumValue($rawStatus)) {
                'route', 'en_ruta', 'in_route', 'on_route' => ShipmentStatus::IN_TRANSIT->value,
                'registrado' => ShipmentStatus::REGISTERED->value,
                'confirmado' => ShipmentStatus::CONFIRMED->value,
                'recogida_programada' => ShipmentStatus::PICKUP_SCHEDULED->value,
                'recogido' => ShipmentStatus::PICKED_UP->value,
                'en_bodega' => ShipmentStatus::IN_WAREHOUSE->value,
                'asignado', 'asignado_a_ruta' => ShipmentStatus::ASSIGNED_TO_ROUTE->value,
                'entregado' => ShipmentStatus::DELIVERED->value,
                'novedad' => ShipmentStatus::ISSUE->value,
                'devuelto' => ShipmentStatus::RETURNED->value,
                'cancelado' => ShipmentStatus::CANCELLED->value,
                default => null,
            };

            if ($normalizedStatus) {
                $updates['status'] = $normalizedStatus;
            }
        }

        $rawPaymentType = (string) ($shipment->getRawOriginal('payment_type') ?? '');
        if ($rawPaymentType !== '' && ! PaymentType::tryFrom($rawPaymentType)) {
            $normalizedPaymentType = match ($this->canonicalLegacyEnumValue($rawPaymentType)) {
                'contra_entrega', 'contraentrega', 'cash_on_delivery', 'cashondelivery' => PaymentType::CASH_ON_DELIVERY->value,
                'post_venta', 'postventa', 'post_sale', 'postsale' => PaymentType::POST_SALE->value,
                'prepago', 'prepaid' => PaymentType::PREPAID->value,
                'mercado_libre', 'mercadolibre' => PaymentType::MercadoLibre->value,
                default => null,
            };

            if ($normalizedPaymentType) {
                $updates['payment_type'] = $normalizedPaymentType;
            }
        }

        $rawFinancialStatus = (string) ($shipment->getRawOriginal('financial_status') ?? '');
        if ($rawFinancialStatus !== '' && ! FinancialStatus::tryFrom($rawFinancialStatus)) {
            $normalizedFinancialStatus = match ($this->canonicalLegacyEnumValue($rawFinancialStatus)) {
                'pending_collection', 'pendingcollection', 'none', 'pendiente', 'pendiente_de_recaudo' => FinancialStatus::PENDING->value,
                'collected', 'recaudado' => FinancialStatus::COLLECTED->value,
                'paid', 'settled', 'liquidado' => FinancialStatus::SETTLED->value,
                'invoiced', 'facturado' => FinancialStatus::INVOICED->value,
                'overdue', 'vencido' => FinancialStatus::OVERDUE->value,
                default => null,
            };

            if ($normalizedFinancialStatus) {
                $updates['financial_status'] = $normalizedFinancialStatus;
            }
        }

        if ($updates !== []) {
            DB::table('shipments')
                ->where('id', $shipment->id)
                ->update($updates);

            $shipment->refresh();
        }

        return $shipment;
    }

    private function canonicalLegacyEnumValue(string $value): string
    {
        return Str::of($value)
            ->trim()
            ->ascii()
            ->lower()
            ->replaceMatches('/[^a-z0-9]+/', '_')
            ->trim('_')
            ->value();
    }

    public function assign(Request $request, Shipment $shipment): JsonResponse
    {
        $request->validate([
            'driver_id' => ['required', 'exists:drivers,id'],
        ]);

        $shipment->update(['driver_id' => $request->driver_id]);

        return response()->json($shipment->fresh(['client', 'driver']));
    }

    /**
     * Cambiar estado de múltiples envíos (batch).
     */
    public function batchStatus(Request $request, TransitionShipmentStatus $action): JsonResponse
    {
        $request->validate([
            'shipment_ids' => ['required', 'array', 'min:1', 'max:50'],
            'shipment_ids.*' => ['integer', 'exists:shipments,id'],
            'status' => ['required', 'string'],
            'description' => ['nullable', 'string', 'max:280'],
        ]);

        $newStatus = ShipmentStatus::tryFrom($request->status);

        if (! $newStatus) {
            return response()->json(['message' => 'Estado inválido.'], 422);
        }
        $results = ['success' => 0, 'failed' => 0, 'errors' => []];

        foreach ($request->shipment_ids as $id) {
            try {
                $shipment = Shipment::findOrFail($id);
                $action->execute($shipment, $newStatus, $request->user(), $request->description);
                $results['success']++;
            } catch (\Exception $e) {
                $results['failed']++;
                $results['errors'][] = "#{$id}: {$e->getMessage()}";
            }
        }

        return response()->json([
            ...$results,
            'message' => "{$results['success']} envíos actualizados.",
        ]);
    }

    /**
     * Asignar conductor a múltiples envíos (batch).
     */
    public function batchAssign(Request $request): JsonResponse
    {
        $request->validate([
            'shipment_ids' => ['required', 'array', 'min:1', 'max:50'],
            'shipment_ids.*' => ['integer', 'exists:shipments,id'],
            'driver_id' => ['required', 'exists:drivers,id'],
        ]);

        $count = Shipment::whereIn('id', $request->shipment_ids)
            ->update(['driver_id' => $request->driver_id]);

        return response()->json([
            'updated' => $count,
            'message' => "{$count} envíos asignados.",
        ]);
    }

    /**
     * Dashboard KPIs.
     */
    public function dashboard(Request $request): JsonResponse
    {
        $today = now()->toDateString();
        [$dashboardQuery, $dashboardScope, $dashboardDate] = $this->dashboardDateScope($today);

        $total = (clone $dashboardQuery)->count();
        $byStatus = (clone $dashboardQuery)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        // Financiero rápido
        $codPending = Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'pending')
            ->sum('cod_amount');
        $codCollected = Shipment::where('payment_type', 'cash_on_delivery')
            ->where('financial_status', 'collected')
            ->sum('cod_amount');
        $postSaleOwed = Shipment::where('payment_type', 'post_sale')
            ->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
            ->sum('shipping_cost');

        // Revenue del periodo operativo mostrado.
        $todayRevenue = (clone $dashboardQuery)->sum('shipping_cost');
        $todayDriverCost = (clone $dashboardQuery)->sum('driver_fee');

        return response()->json([
            'today' => [
                'total' => $total,
                'scope' => $dashboardScope,
                'scope_date' => $dashboardDate,
                'registered' => $byStatus['registered'] ?? 0,
                'confirmed' => $byStatus['confirmed'] ?? 0,
                'pickup_scheduled' => $byStatus['pickup_scheduled'] ?? 0,
                'picked_up' => $byStatus['picked_up'] ?? 0,
                'in_warehouse' => $byStatus['in_warehouse'] ?? 0,
                'assigned_to_route' => $byStatus['assigned_to_route'] ?? 0,
                'in_transit' => $byStatus['in_transit'] ?? 0,
                'delivered' => $byStatus['delivered'] ?? 0,
                'issue' => $byStatus['issue'] ?? 0,
                'returned' => $byStatus['returned'] ?? 0,
                'cancelled' => $byStatus['cancelled'] ?? 0,
            ],
            'financial' => [
                'cod_pending' => (int) $codPending,
                'cod_collected' => (int) $codCollected,
                'post_sale_owed' => (int) $postSaleOwed,
                'today_revenue' => (int) $todayRevenue,
                'today_driver_cost' => (int) $todayDriverCost,
                'today_profit' => (int) ($todayRevenue - $todayDriverCost),
            ],
            'week' => [
                'total' => Shipment::where('created_at', '>=', now()->startOfWeek())->count(),
            ],
        ]);
    }

    private function dashboardDateScope(string $today): array
    {
        $todayQuery = Shipment::whereDate('created_at', $today);

        if ((clone $todayQuery)->exists()) {
            return [$todayQuery, 'today', $today];
        }

        $latestCreatedAt = Shipment::latest('created_at')->value('created_at');

        if (! $latestCreatedAt) {
            return [$todayQuery, 'today', $today];
        }

        $latestDate = Carbon::parse($latestCreatedAt)->toDateString();

        return [
            Shipment::whereDate('created_at', $latestDate),
            $latestDate === $today ? 'today' : 'latest_activity',
            $latestDate,
        ];
    }

    /**
     * Estadísticas por hora del día actual — para gráfica de dashboard.
     */
    public function hourlyStats(): JsonResponse
    {
        $today = now()->toDateString();
        $driver = DB::getDriverName();

        // Expresion de hora compatible con MySQL, PostgreSQL y SQLite.
        $hourExpr = match ($driver) {
            'mysql', 'mariadb' => "CAST(DATE_FORMAT(created_at, '%H') AS UNSIGNED)",
            'pgsql' => "EXTRACT(HOUR FROM created_at)::int",
            default => "CAST(strftime('%H', created_at) AS INTEGER)",
        };
        $hourExprDelivered = match ($driver) {
            'mysql', 'mariadb' => "CAST(DATE_FORMAT(delivered_at, '%H') AS UNSIGNED)",
            'pgsql' => "EXTRACT(HOUR FROM delivered_at)::int",
            default => "CAST(strftime('%H', delivered_at) AS INTEGER)",
        };

        $shipments = Shipment::whereDate('created_at', $today)
            ->selectRaw("{$hourExpr} as hour, count(*) as total")
            ->groupBy('hour')
            ->orderBy('hour')
            ->pluck('total', 'hour');
        $hours = [];
        for ($h = 6; $h <= 20; $h++) {
            $hours[] = [
                'hour' => sprintf('%d:00', $h),
                'label' => sprintf('%d %s', $h > 12 ? $h - 12 : $h, $h >= 12 ? 'PM' : 'AM'),
                'count' => $shipments[$h] ?? $shipments[str_pad($h, 2, '0', STR_PAD_LEFT)] ?? 0,
            ];
        }

        $deliveries = Shipment::whereDate('delivered_at', $today)
            ->selectRaw("{$hourExprDelivered} as hour, count(*) as total")
            ->groupBy('hour')
            ->orderBy('hour')
            ->pluck('total', 'hour');

        $deliveryHours = [];
        for ($h = 6; $h <= 20; $h++) {
            $deliveryHours[] = [
                'hour' => sprintf('%d:00', $h),
                'count' => $deliveries[$h] ?? $deliveries[str_pad($h, 2, '0', STR_PAD_LEFT)] ?? 0,
            ];
        }

        return response()->json([
            'registrations' => $hours,
            'deliveries' => $deliveryHours,
            'peak_hour' => collect($hours)->sortByDesc('count')->first(),
        ]);
    }
}
