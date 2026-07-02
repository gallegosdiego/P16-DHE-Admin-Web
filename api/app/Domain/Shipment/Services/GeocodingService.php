<?php

namespace App\Domain\Shipment\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Servicio de geocodificación con estrategia:
 * 1. Google Maps Geocoding API si hay API key.
 * 2. Nominatim de OpenStreetMap como fallback sin credenciales.
 */
class GeocodingService
{
    /**
     * Geocodifica una dirección y ciudad en Colombia.
     *
     * @return array{lat: float, lng: float}|null
     */
    public function geocode(string $address, string $city): ?array
    {
        $fullAddress = "{$address}, {$city}, Colombia";

        $googleResult = $this->tryGoogleGeocoding($fullAddress);
        if ($googleResult) {
            return $googleResult;
        }

        return $this->tryNominatimGeocoding($fullAddress);
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
}
