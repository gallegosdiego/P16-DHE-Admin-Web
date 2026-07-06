<?php

namespace App\Domain\Shipment\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
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

        return [
            'address' => $this->normalizeAddress($address, $normalizedZone, $normalizedCity),
            'city' => $normalizedCity,
            'zone' => $normalizedZone,
        ];
    }

    /**
     * Geocodifica una dirección y ciudad en Colombia.
     *
     * @return array{lat: float, lng: float}|null
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
            $googleResult = $this->tryGoogleGeocoding($fullAddress);
            if ($googleResult) {
                return $googleResult;
            }

            $fallbackResult = $this->tryNominatimGeocoding($fullAddress);
            if ($fallbackResult) {
                return $fallbackResult;
            }
        }

        return null;
    }

    /**
     * @return array{lat: float, lng: float}|null
     */
    private function tryGoogleGeocoding(string $fullAddress): ?array
    {
        $apiKey = config('services.google.maps_key');

        if (! $apiKey) {
            Log::info('GeocodingService: GOOGLE_MAPS_API_KEY no configurada, usando fallback Nominatim.');

            return null;
        }

        try {
            $response = Http::timeout(5)->get('https://maps.googleapis.com/maps/api/geocode/json', [
                'address' => $fullAddress,
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

            $location = $data['results'][0]['geometry']['location'];

            return $this->normalizeCoordinates(
                $location['lat'] ?? null,
                $location['lng'] ?? null,
            );
        } catch (\Throwable $e) {
            Log::warning('GeocodingService: error al geocodificar con Google.', [
                'address' => $fullAddress,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * @return array{lat: float, lng: float}|null
     */
    private function tryNominatimGeocoding(string $fullAddress): ?array
    {
        $userAgent = trim((string) config('services.google.fallback_user_agent', config('app.name', 'Danhei Express').'/1.0'));

        try {
            $response = Http::withHeaders([
                'User-Agent' => $userAgent !== '' ? $userAgent : 'Danhei Express/1.0',
                'Accept-Language' => 'es-CO,es;q=0.9,en;q=0.8',
            ])->timeout(8)->get('https://nominatim.openstreetmap.org/search', [
                'q' => $fullAddress,
                'format' => 'jsonv2',
                'limit' => 1,
                'countrycodes' => 'co',
                'addressdetails' => 0,
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

            return $this->normalizeCoordinates(
                $data[0]['lat'] ?? null,
                $data[0]['lon'] ?? null,
            );
        } catch (\Throwable $e) {
            Log::warning('GeocodingService: error al geocodificar con Nominatim.', [
                'address' => $fullAddress,
                'error' => $e->getMessage(),
            ]);

            return null;
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
                $queries[] = $this->buildFullAddress($addressVariant, (string) $zone);
            }

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

        $cityCandidate = $this->isContextCandidate(end($segments) ?: null)
            ? (end($segments) ?: null)
            : null;

        $zoneCandidate = count($segments) >= 2 && $this->isContextCandidate($segments[count($segments) - 2])
            ? $segments[count($segments) - 2]
            : null;

        return [
            'city' => $cityCandidate,
            'zone' => $zoneCandidate,
        ];
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
