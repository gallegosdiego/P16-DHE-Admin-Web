<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shared\Models\Zone;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Servicio de geocodificación con estrategia:
 * 1. Google Maps Geocoding API si hay API key.
 * 2. Nominatim de OpenStreetMap como fallback sin credenciales.
 */
class GeocodingService
{
    /**
     * @return array{address: ?string, city: ?string, zone: ?string}
     */
    public function normalizeLocationInput(?string $address, ?string $city = null, ?string $zone = null): array
    {
        $extracted = $this->extractContextFromAddress($address);
        $normalizedCity = $this->normalizeTextFragment(filled($city) ? $city : $extracted['city'], titleCase: true);
        $normalizedZone = $this->normalizeTextFragment(filled($zone) ? $zone : $extracted['zone'], titleCase: true);

        // El normalizador quita tildes para poder comparar texto libre, pero la
        // zona que se guarda tiene que ser la del catalogo: "Usaquen" y
        // "Usaquén" son cadenas distintas para el tablero de despacho, que
        // agrupa por texto exacto, y para el desplegable de zona, que no
        // encuentra la opcion y la deja en blanco.
        $normalizedZone = $this->canonicalZoneName($normalizedZone) ?? $normalizedZone;

        return [
            'address' => $this->normalizeAddress($address, $normalizedZone, $normalizedCity),
            'city' => $normalizedCity,
            'zone' => $normalizedZone,
        ];
    }

    /**
     * Geocodifica una dirección y ciudad en Colombia.
     *
     * @return array{
     *     lat: float,
     *     lng: float,
     *     locality?: ?string,
     *     neighborhood?: ?string,
     *     matched_zone?: ?string,
     *     formatted_address?: ?string,
     *     provider: string
     * }|null
     */
    public function geocode(string $address, string $city, ?string $zone = null): ?array
    {
        $normalized = $this->normalizeLocationInput($address, $city, $zone);
        $queries = $this->buildQueries(
            $normalized['address'],
            $normalized['city'],
            $normalized['zone'],
        );

        foreach ($queries as $fullAddress) {
            $googleResult = $this->tryGoogleGeocoding($fullAddress, $normalized['city']);
            if ($googleResult) {
                return $googleResult;
            }

            $fallbackResult = $this->tryNominatimGeocoding($fullAddress, $normalized['city']);
            if ($fallbackResult) {
                return $fallbackResult;
            }
        }

        return null;
    }

    /**
     * @return list<array{
     *     label: string,
     *     formatted_address: string,
     *     lat: float,
     *     lng: float,
     *     provider: string,
     *     query: string
     * }>
     */
    public function searchCandidates(string $address, string $city, ?string $zone = null, int $limit = 5): array
    {
        $normalized = $this->normalizeLocationInput($address, $city, $zone);
        $queries = $this->buildQueries(
            $normalized['address'],
            $normalized['city'],
            $normalized['zone'],
        );

        if ($queries === []) {
            return [];
        }

        $boundedLimit = max(1, min($limit, 8));

        foreach ($queries as $fullAddress) {
            $googleCandidates = $this->tryGoogleCandidateSearch($fullAddress, $boundedLimit);
            if ($googleCandidates !== []) {
                return $this->uniqueCandidates($googleCandidates, $boundedLimit);
            }

            $fallbackCandidates = $this->tryNominatimCandidateSearch($fullAddress, $boundedLimit);
            if ($fallbackCandidates !== []) {
                return $this->uniqueCandidates($fallbackCandidates, $boundedLimit);
            }
        }

        return [];
    }

    /**
     * @return array{
     *     lat: float,
     *     lng: float,
     *     locality?: ?string,
     *     neighborhood?: ?string,
     *     matched_zone?: ?string,
     *     formatted_address?: ?string,
     *     provider: string
     * }|null
     */
    private function tryGoogleGeocoding(string $fullAddress, ?string $expectedCity = null): ?array
    {
        $apiKey = config('services.google.maps_key');

        if (! $apiKey) {
            Log::info('GeocodingService: GOOGLE_MAPS_API_KEY no configurada, usando fallback Nominatim.');

            return null;
        }

        try {
            $response = Http::timeout(5)->get('https://maps.googleapis.com/maps/api/geocode/json', [
                'address' => $fullAddress,
                'components' => 'country:CO',
                'region' => 'co',
                'language' => 'es',
                'key' => $apiKey,
            ]);

            if (! $response->successful()) {
                Log::warning('GeocodingService: respuesta HTTP Google no exitosa.', [
                    'status' => $response->status(),
                    'address' => $fullAddress,
                ]);

                return null;
            }

            $data = $response->json();

            if (($data['status'] ?? '') !== 'OK' || empty($data['results'])) {
                Log::warning('GeocodingService: Google sin resultados de geocodificación.', [
                    'status' => $data['status'] ?? 'unknown',
                    'address' => $fullAddress,
                ]);

                return null;
            }

            foreach (array_slice($data['results'], 0, 3) as $result) {
                $resultCities = collect($result['address_components'] ?? [])
                    ->filter(fn ($component) => array_intersect(
                        ['locality', 'postal_town', 'administrative_area_level_1', 'administrative_area_level_2'],
                        $component['types'] ?? [],
                    ) !== [])
                    ->pluck('long_name')
                    ->all();

                if (! $this->matchesExpectedCity($expectedCity, $resultCities)) {
                    continue;
                }

                $location = $result['geometry']['location'] ?? [];
                $coords = $this->normalizeCoordinates($location['lat'] ?? null, $location['lng'] ?? null);
                if ($coords) {
                    $locality = null;
                    $neighborhood = null;
                    foreach (($result['address_components'] ?? []) as $component) {
                        $types = $component['types'] ?? [];
                        if (in_array('sublocality_level_1', $types, true) || in_array('sublocality', $types, true)) {
                            $locality = $locality ?? $component['long_name'];
                        }
                        if (in_array('neighborhood', $types, true)) {
                            $neighborhood = $neighborhood ?? $component['long_name'];
                        }
                    }

                    $matchedZone = $this->matchZoneFromLocality($locality, $expectedCity);

                    return [
                        'lat' => $coords['lat'],
                        'lng' => $coords['lng'],
                        'locality' => $locality,
                        'neighborhood' => $neighborhood,
                        'matched_zone' => $matchedZone,
                        'formatted_address' => data_get($result, 'formatted_address'),
                        'provider' => 'google_maps',
                    ];
                }
            }

            Log::warning('GeocodingService: Google solo devolvio resultados fuera de la ciudad esperada.', [
                'address' => $fullAddress,
                'expected_city' => $expectedCity,
            ]);

            return null;
        } catch (\Throwable $e) {
            Log::warning('GeocodingService: error al geocodificar con Google.', [
                'address' => $fullAddress,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * @return array{
     *     lat: float,
     *     lng: float,
     *     locality?: ?string,
     *     neighborhood?: ?string,
     *     matched_zone?: ?string,
     *     formatted_address?: ?string,
     *     provider: string
     * }|null
     */
    private function tryNominatimGeocoding(string $fullAddress, ?string $expectedCity = null): ?array
    {
        $userAgent = trim((string) config('services.google.fallback_user_agent', config('app.name', 'Danhei Express').'/1.0'));

        try {
            // addressdetails y limit>1: Nominatim con q= libre descarta los
            // terminos que no encuentra, asi que puede devolver «Calle 26» de
            // otra ciudad con toda confianza. Se piden varios candidatos y se
            // acepta el primero cuya ciudad coincida con la esperada.
            $response = Http::withHeaders([
                'User-Agent' => $userAgent !== '' ? $userAgent : 'Danhei Express/1.0',
                'Accept-Language' => 'es-CO,es;q=0.9,en;q=0.8',
            ])->timeout(8)->get('https://nominatim.openstreetmap.org/search', [
                'q' => $fullAddress,
                'format' => 'jsonv2',
                'limit' => 3,
                'countrycodes' => 'co',
                'addressdetails' => 1,
            ]);

            if (! $response->successful()) {
                Log::warning('GeocodingService: respuesta HTTP Nominatim no exitosa.', [
                    'status' => $response->status(),
                    'address' => $fullAddress,
                ]);

                return null;
            }

            $data = $response->json();

            if (! is_array($data) || empty($data[0])) {
                Log::warning('GeocodingService: Nominatim sin resultados de geocodificación.', [
                    'address' => $fullAddress,
                ]);

                return null;
            }

            foreach ($data as $result) {
                $resultCities = collect([
                    data_get($result, 'address.city'),
                    data_get($result, 'address.town'),
                    data_get($result, 'address.municipality'),
                    data_get($result, 'address.village'),
                    data_get($result, 'address.county'),
                    data_get($result, 'address.state'),
                ])->filter()->values()->all();

                if (! $this->matchesExpectedCity($expectedCity, $resultCities)) {
                    continue;
                }

                $coords = $this->normalizeCoordinates(
                    $result['lat'] ?? null,
                    $result['lon'] ?? null,
                );
                if ($coords) {
                    $locality = data_get($result, 'address.city_district')
                        ?? data_get($result, 'address.suburb')
                        ?? data_get($result, 'address.borough');
                    $neighborhood = data_get($result, 'address.neighbourhood')
                        ?? data_get($result, 'address.quarter')
                        ?? data_get($result, 'address.subdivision');

                    $matchedZone = $this->matchZoneFromLocality($locality, $expectedCity);

                    return [
                        'lat' => $coords['lat'],
                        'lng' => $coords['lng'],
                        'locality' => $locality,
                        'neighborhood' => $neighborhood,
                        'matched_zone' => $matchedZone,
                        'formatted_address' => data_get($result, 'display_name'),
                        'provider' => 'nominatim',
                    ];
                }
            }

            Log::warning('GeocodingService: Nominatim solo devolvio resultados fuera de la ciudad esperada.', [
                'address' => $fullAddress,
                'expected_city' => $expectedCity,
            ]);

            return null;
        } catch (\Throwable $e) {
            Log::warning('GeocodingService: error al geocodificar con Nominatim.', [
                'address' => $fullAddress,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * @return list<array{
     *     label: string,
     *     formatted_address: string,
     *     lat: float,
     *     lng: float,
     *     provider: string,
     *     query: string
     * }>
     */
    private function tryGoogleCandidateSearch(string $fullAddress, int $limit): array
    {
        $apiKey = config('services.google.maps_key');

        if (! $apiKey) {
            return [];
        }

        try {
            $response = Http::timeout(5)->get('https://maps.googleapis.com/maps/api/geocode/json', [
                'address' => $fullAddress,
                'key' => $apiKey,
            ]);

            if (! $response->successful()) {
                Log::warning('GeocodingService: respuesta HTTP Google no exitosa al buscar candidatos.', [
                    'status' => $response->status(),
                    'address' => $fullAddress,
                ]);

                return [];
            }

            $data = $response->json();
            $results = is_array($data['results'] ?? null) ? $data['results'] : [];

            if (($data['status'] ?? '') !== 'OK' || $results === []) {
                return [];
            }

            $candidates = [];

            foreach (array_slice($results, 0, $limit) as $result) {
                $coords = $this->normalizeCoordinates(
                    data_get($result, 'geometry.location.lat'),
                    data_get($result, 'geometry.location.lng'),
                );

                if (! $coords) {
                    continue;
                }

                $label = trim((string) data_get($result, 'formatted_address', ''));
                if ($label === '') {
                    continue;
                }

                $candidates[] = [
                    'label' => $label,
                    'formatted_address' => $label,
                    'lat' => $coords['lat'],
                    'lng' => $coords['lng'],
                    'provider' => 'google',
                    'query' => $fullAddress,
                ];
            }

            return $candidates;
        } catch (\Throwable $e) {
            Log::warning('GeocodingService: error al buscar candidatos con Google.', [
                'address' => $fullAddress,
                'error' => $e->getMessage(),
            ]);

            return [];
        }
    }

    /**
     * @return list<array{
     *     label: string,
     *     formatted_address: string,
     *     lat: float,
     *     lng: float,
     *     provider: string,
     *     query: string
     * }>
     */
    private function tryNominatimCandidateSearch(string $fullAddress, int $limit): array
    {
        $userAgent = trim((string) config('services.google.fallback_user_agent', config('app.name', 'Danhei Express').'/1.0'));

        try {
            $response = Http::withHeaders([
                'User-Agent' => $userAgent !== '' ? $userAgent : 'Danhei Express/1.0',
                'Accept-Language' => 'es-CO,es;q=0.9,en;q=0.8',
            ])->timeout(8)->get('https://nominatim.openstreetmap.org/search', [
                'q' => $fullAddress,
                'format' => 'jsonv2',
                'limit' => $limit,
                'countrycodes' => 'co',
                'addressdetails' => 0,
            ]);

            if (! $response->successful()) {
                Log::warning('GeocodingService: respuesta HTTP Nominatim no exitosa al buscar candidatos.', [
                    'status' => $response->status(),
                    'address' => $fullAddress,
                ]);

                return [];
            }

            $data = $response->json();
            if (! is_array($data)) {
                return [];
            }

            $candidates = [];

            foreach (array_slice($data, 0, $limit) as $result) {
                $coords = $this->normalizeCoordinates(
                    data_get($result, 'lat'),
                    data_get($result, 'lon'),
                );

                if (! $coords) {
                    continue;
                }

                $label = trim((string) data_get($result, 'display_name', ''));
                if ($label === '') {
                    continue;
                }

                $candidates[] = [
                    'label' => $label,
                    'formatted_address' => $label,
                    'lat' => $coords['lat'],
                    'lng' => $coords['lng'],
                    'provider' => 'nominatim',
                    'query' => $fullAddress,
                ];
            }

            return $candidates;
        } catch (\Throwable $e) {
            Log::warning('GeocodingService: error al buscar candidatos con Nominatim.', [
                'address' => $fullAddress,
                'error' => $e->getMessage(),
            ]);

            return [];
        }
    }

    /**
     * @return array{lat: float, lng: float}|null
     */
    private function normalizeCoordinates(mixed $lat, mixed $lng): ?array
    {
        if (! is_numeric($lat) || ! is_numeric($lng)) {
            return null;
        }

        $latitude = (float) $lat;
        $longitude = (float) $lng;

        if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
            return null;
        }

        if ($latitude === 0.0 && $longitude === 0.0) {
            return null;
        }

        return [
            'lat' => $latitude,
            'lng' => $longitude,
        ];
    }

    /**
     * @param  list<array{
     *     label: string,
     *     formatted_address: string,
     *     lat: float,
     *     lng: float,
     *     provider: string,
     *     query: string
     * }>  $candidates
     * @return list<array{
     *     label: string,
     *     formatted_address: string,
     *     lat: float,
     *     lng: float,
     *     provider: string,
     *     query: string
     * }>
     */
    private function uniqueCandidates(array $candidates, int $limit): array
    {
        $unique = [];

        foreach ($candidates as $candidate) {
            $key = sprintf(
                '%s|%s|%s',
                round((float) $candidate['lat'], 6),
                round((float) $candidate['lng'], 6),
                Str::lower(trim((string) $candidate['formatted_address'])),
            );

            if (isset($unique[$key])) {
                continue;
            }

            $unique[$key] = $candidate;
            if (count($unique) >= $limit) {
                break;
            }
        }

        return array_values($unique);
    }

    /**
     * Un resultado se acepta si su ciudad coincide con la esperada. Es
     * tolerante a proposito cuando falta informacion (sin ciudad esperada, o
     * proveedor sin detalle de direccion): rechazar solo se justifica cuando
     * hay evidencia POSITIVA de que el punto quedo en otra ciudad. Mejor sin
     * coordenadas que una guia de Bogota clavada en Cucuta.
     *
     * @param list<string> $resultCities
     */
    private function matchesExpectedCity(?string $expectedCity, array $resultCities): bool
    {
        $expectedSlug = Str::slug((string) $expectedCity);

        if ($expectedSlug === '' || $resultCities === []) {
            return true;
        }

        foreach ($resultCities as $candidate) {
            $candidateSlug = Str::slug((string) $candidate);
            if ($candidateSlug === '') {
                continue;
            }
            if (str_contains($candidateSlug, $expectedSlug) || str_contains($expectedSlug, $candidateSlug)) {
                return true;
            }
        }

        return false;
    }

    private function buildFullAddress(string ...$parts): string
    {
        $segments = collect($parts)
            ->map(fn (string $part) => trim($part))
            ->filter(fn (string $part) => $part !== '')
            ->values()
            ->all();

        $segments[] = 'Colombia';

        return implode(', ', array_values(array_unique($segments)));
    }

    /**
     * @return list<string>
     */
    private function buildQueries(?string $address, ?string $city, ?string $zone): array
    {
        if (! filled($address) || ! filled($city)) {
            return [];
        }

        $queries = [];
        $addressVariants = array_values(array_unique(array_filter([
            $address,
            $this->stripSecondaryAddressDetails($address),
            $this->withoutHouseNumberMarker($address),
            $this->withoutHouseNumberMarker($this->stripSecondaryAddressDetails($address)),
        ])));

        foreach ($addressVariants as $addressVariant) {
            if (filled($zone) && strcasecmp((string) $zone, (string) $city) !== 0) {
                $queries[] = $this->buildFullAddress($addressVariant, (string) $zone, (string) $city);
            }

            // Nunca una consulta sin ciudad: «Calle 26 # 50-24, Colombia» le
            // deja al geocodificador elegir la ciudad, y elige cualquiera —
            // asi termino una guia de Bogota clavada en Cucuta (QA 31/08).
            $queries[] = $this->buildFullAddress($addressVariant, (string) $city);
        }

        return array_values(array_unique(array_filter($queries)));
    }

    private function normalizeAddress(?string $address, ?string $zone = null, ?string $city = null): ?string
    {
        $normalized = $this->normalizeTextFragment($address);

        if (! filled($normalized)) {
            return null;
        }

        foreach ([$zone, $city, $zone] as $context) {
            $normalized = $this->stripTrailingContext($normalized, $context);
        }

        $patterns = [
            '/\bcll\b|\bcl\b|\bcalle\b/i' => 'calle',
            '/\bcra\b|\bkr\b|\bkra\b|\bcarrera\b/i' => 'carrera',
            '/\bav\b|\bavenida\b/i' => 'avenida',
            '/\bdiag\b|\bdiagonal\b/i' => 'diagonal',
            '/\btv\b|\btransv\b|\btransversal\b/i' => 'transversal',
            '/\bcirc\b|\bcircular\b/i' => 'circular',
            '/\bapt\b|\bapto\b|\bapartamento\b/i' => 'apartamento',
            '/\bof\b|\bofic\b|\boficina\b/i' => 'oficina',
            '/\bbdg\b|\bbodega\b/i' => 'bodega',
            '/\bno\b|\bnro\b|\bnum\b|\bnumero\b/i' => '#',
        ];

        foreach ($patterns as $pattern => $replacement) {
            $normalized = preg_replace($pattern, $replacement, $normalized) ?? $normalized;
        }

        $normalized = preg_replace('/\s*#\s*/', ' # ', $normalized) ?? $normalized;
        $normalized = preg_replace('/#\s*(\d+[a-z]?)\s+(\d+[a-z]?)(\b|$)/i', '# $1-$2$3', $normalized) ?? $normalized;
        $normalized = preg_replace('/\s*-\s*/', '-', $normalized) ?? $normalized;
        $normalized = preg_replace('/\s*,\s*/', ', ', $normalized) ?? $normalized;
        $normalized = preg_replace('/\s+/', ' ', $normalized) ?? $normalized;
        $normalized = trim($normalized, " \t\n\r\0\x0B,.-");

        if ($normalized === '') {
            return null;
        }

        return $this->titleizeAddress($normalized);
    }

    /**
     * @return array{city: ?string, zone: ?string}
     */
    private function extractContextFromAddress(?string $address): array
    {
        if (! filled($address)) {
            return ['city' => null, 'zone' => null];
        }

        $segments = array_values(array_filter(array_map(
            fn (string $segment) => trim((string) $this->normalizeTextFragment($segment, titleCase: true)),
            explode(',', (string) $address)
        )));

        if ($segments === []) {
            return ['city' => null, 'zone' => null];
        }

        if (count($segments) < 2) {
            return ['city' => null, 'zone' => null];
        }

        $cityCandidate = $this->isContextCandidate(end($segments) ?: null)
            ? (end($segments) ?: null)
            : null;

        $zoneRaw = count($segments) >= 2 && $this->isContextCandidate($segments[count($segments) - 2])
            ? $segments[count($segments) - 2]
            : null;

        // Validar siempre contra el catálogo de zonas activas para no inventar "Centro" u otras cadenas
        $zoneCandidate = null;
        if (filled($zoneRaw) && Schema::hasTable('zones')) {
            $zoneSlug = Str::slug((string) $zoneRaw);
            $validZone = Zone::where('is_active', true)
                ->where(function ($query) use ($zoneSlug, $zoneRaw) {
                    $query->where('slug', $zoneSlug)
                        ->orWhere('name', $zoneRaw);
                })
                ->first(['name']);
            if ($validZone) {
                $zoneCandidate = $validZone->name;
            }
        }

        return [
            'city' => $cityCandidate,
            'zone' => $zoneCandidate,
        ];
    }

    /**
     * Devuelve el nombre tal como esta en el catalogo cuando la zona coincide
     * por identificador. Sirve para que un texto ya limpio pero sin tildes
     * vuelva a su forma canonica antes de guardarse.
     */
    public function canonicalZoneName(?string $zoneCandidate): ?string
    {
        if (! filled($zoneCandidate) || ! Schema::hasTable('zones')) {
            return null;
        }

        $slug = Str::slug((string) $zoneCandidate);

        if ($slug === '') {
            return null;
        }

        return Zone::query()->where('slug', $slug)->value('name');
    }

    public function matchZoneFromLocality(?string $localityCandidate, ?string $resolvedCity = 'Bogotá'): ?string
    {
        if (! filled($localityCandidate) || ! Schema::hasTable('zones')) {
            return null;
        }

        if (! $this->isBogotaCity($resolvedCity)) {
            return null;
        }

        $cleanLocality = preg_replace('/^(localidad|barrio|sector)\s+/i', '', trim((string) $localityCandidate));
        $candidateSlug = Str::slug($cleanLocality);

        if ($candidateSlug === '') {
            return null;
        }

        $zones = Zone::query()
            ->where('is_active', true)
            ->get(['id', 'name', 'slug', 'city'])
            ->filter(fn (Zone $zone) => $this->isBogotaCity($zone->city));

        // 1. Coincidencia exacta de slug
        $match = $zones->first(function (Zone $zone) use ($candidateSlug) {
            $zoneSlug = trim((string) ($zone->slug ?: Str::slug((string) $zone->name)));

            return $zoneSlug === $candidateSlug;
        });

        if ($match) {
            return $match->name;
        }

        // 2. Coincidencia si el slug contiene o está contenido
        $match = $zones->first(function (Zone $zone) use ($candidateSlug) {
            $zoneSlug = trim((string) ($zone->slug ?: Str::slug((string) $zone->name)));

            return str_contains($candidateSlug, $zoneSlug) || str_contains($zoneSlug, $candidateSlug);
        });

        return $match ? $match->name : null;
    }

    public function isBogotaCity(?string $city): bool
    {
        if (! filled($city)) {
            return true;
        }

        $slug = Str::slug((string) $city);

        return $slug === ''
            || str_starts_with($slug, 'bogot')
            || in_array($slug, ['distrito-capital', 'dc', 'd-c'], true);
    }

    private function stripTrailingContext(string $address, ?string $context): string
    {
        $normalizedContext = $this->normalizeTextFragment($context);

        if (! filled($normalizedContext)) {
            return $address;
        }

        $result = $address;

        do {
            $previous = $result;
            $result = preg_replace(
                '/(?:\s*,\s*|\s*-\s*|\s+)\Q'.$normalizedContext.'\E$/i',
                '',
                $result
            ) ?? $result;
            $result = trim($result, " \t\n\r\0\x0B,.-");
        } while ($result !== $previous);

        return $result;
    }

    private function stripSecondaryAddressDetails(string $address): string
    {
        $stripped = preg_replace(
            '/\b(apartamento|apto|interior|torre|piso|casa|bodega|local|oficina|bloque)\b.*$/i',
            '',
            $address
        ) ?? $address;

        $primarySegment = trim(explode(',', $stripped)[0] ?? $stripped);

        return trim($primarySegment, " \t\n\r\0\x0B,.-");
    }

    private function withoutHouseNumberMarker(string $address): string
    {
        $withoutMarker = preg_replace('/\s*#\s*/', ' ', $address) ?? $address;
        $withoutMarker = preg_replace('/\s+/', ' ', $withoutMarker) ?? $withoutMarker;

        return trim($withoutMarker, " \t\n\r\0\x0B,.-");
    }

    private function titleizeAddress(string $address): string
    {
        $segments = preg_split('/\s+/', $address) ?: [$address];

        $segments = array_map(function (string $segment): string {
            if ($segment === '#') {
                return '#';
            }

            if (preg_match('/^\d+[a-z]?([\-\/]\d+[a-z]?)?$/i', $segment) === 1) {
                return strtoupper($segment);
            }

            return Str::title($segment);
        }, $segments);

        return implode(' ', $segments);
    }

    private function normalizeTextFragment(?string $value, bool $titleCase = false): ?string
    {
        if (! filled($value)) {
            return null;
        }

        $normalized = Str::of((string) $value)
            ->ascii()
            ->replaceMatches('/[|;]+/', ',')
            ->replaceMatches('/\s*,\s*/', ', ')
            ->replaceMatches('/\s+/', ' ')
            ->trim(" \t\n\r\0\x0B,.-")
            ->value();

        if ($normalized === '') {
            return null;
        }

        return $titleCase ? Str::title(Str::lower($normalized)) : $normalized;
    }

    private function isContextCandidate(?string $value): bool
    {
        if (! filled($value)) {
            return false;
        }

        if (preg_match('/\d/', (string) $value) === 1) {
            return false;
        }

        return preg_match('/\b(apartamento|apto|interior|torre|piso|casa|bodega|local|oficina|bloque)\b/i', (string) $value) !== 1;
    }
}
