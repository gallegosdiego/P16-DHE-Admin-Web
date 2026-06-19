<?php

namespace App\Domain\Shipment\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Servicio de geocodificación usando Google Maps Geocoding API.
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
        $apiKey = config('services.google.maps_key');

        if (! $apiKey) {
            Log::warning('GeocodingService: GOOGLE_MAPS_API_KEY no configurada.');

            return null;
        }

        $fullAddress = "{$address}, {$city}, Colombia";

        try {
            $response = Http::timeout(5)->get('https://maps.googleapis.com/maps/api/geocode/json', [
                'address' => $fullAddress,
                'key' => $apiKey,
            ]);

            if (! $response->successful()) {
                Log::warning('GeocodingService: respuesta HTTP no exitosa.', [
                    'status' => $response->status(),
                    'address' => $fullAddress,
                ]);

                return null;
            }

            $data = $response->json();

            if (($data['status'] ?? '') !== 'OK' || empty($data['results'])) {
                Log::warning('GeocodingService: sin resultados de geocodificación.', [
                    'status' => $data['status'] ?? 'unknown',
                    'address' => $fullAddress,
                ]);

                return null;
            }

            $location = $data['results'][0]['geometry']['location'];

            return [
                'lat' => (float) $location['lat'],
                'lng' => (float) $location['lng'],
            ];
        } catch (\Throwable $e) {
            Log::warning('GeocodingService: error al geocodificar.', [
                'address' => $fullAddress,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }
}
