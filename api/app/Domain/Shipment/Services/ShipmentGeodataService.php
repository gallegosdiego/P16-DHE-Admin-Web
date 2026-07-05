<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shared\Models\Zone;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class ShipmentGeodataService
{
    /**
     * Normaliza el contexto geográfico del envío antes de guardar o enrutar.
     *
     * @return array{city_resolved: bool, coordinates_cleared: bool, geocoded: bool}
     */
    public function repair(Shipment $shipment): array
    {
        $addressContextChanged = $this->addressContextChanged($shipment);
        $cityResolved = $this->applyRecipientCityFallback($shipment);
        $this->normalizeLocationContext($shipment);
        $coordinatesNormalized = $this->normalizeCoordinatePair($shipment);
        $coordinatesCleared = false;
        $geocoded = false;

        if ($shipment->hasValidManualCoordinates()) {
            $shipment->geocoded_at = $shipment->geocoded_at ?? now();

            return [
                'city_resolved' => $cityResolved,
                'coordinates_cleared' => $coordinatesNormalized,
                'geocoded' => false,
            ];
        }

        if (! $shipment->coordinatesMissing() && ! $addressContextChanged) {
            return [
                'city_resolved' => $cityResolved,
                'coordinates_cleared' => $coordinatesNormalized,
                'geocoded' => false,
            ];
        }

        if (! $shipment->geocodingEligible()) {
            $zoneFallbackApplied = $this->applyZoneCentroidFallback($shipment);

            return [
                'city_resolved' => $cityResolved,
                'coordinates_cleared' => $coordinatesNormalized,
                'geocoded' => $zoneFallbackApplied,
            ];
        }

        if ($addressContextChanged && $shipment->hasRecipientCoordinates()) {
            $shipment->recipient_lat = null;
            $shipment->recipient_lng = null;
            $shipment->geocoded_at = null;
            $coordinatesCleared = true;
        }

        $geocoded = $shipment->attemptGeocoding();

        if (! $geocoded) {
            $geocoded = $this->applyZoneCentroidFallback($shipment);
        }

        if (! $geocoded) {
            $geocoded = $this->applyCityGeocodeFallback($shipment);
        }

        return [
            'city_resolved' => $cityResolved,
            'coordinates_cleared' => $coordinatesCleared || $coordinatesNormalized,
            'geocoded' => $geocoded,
        ];
    }

    private function normalizeLocationContext(Shipment $shipment): void
    {
        $normalized = App::make(GeocodingService::class)->normalizeLocationInput(
            $shipment->recipient_address,
            $shipment->recipient_city,
            $shipment->recipient_zone,
        );

        $shipment->recipient_address = $normalized['address'];
        $shipment->recipient_city = $normalized['city'];
        $shipment->recipient_zone = $normalized['zone'];
    }

    private function normalizeCoordinatePair(Shipment $shipment): bool
    {
        $hasLat = is_numeric($shipment->recipient_lat);
        $hasLng = is_numeric($shipment->recipient_lng);

        if ($hasLat === $hasLng) {
            return false;
        }

        $shipment->recipient_lat = null;
        $shipment->recipient_lng = null;
        $shipment->geocoded_at = null;

        return true;
    }

    public function applyRecipientCityFallback(Shipment $shipment): bool
    {
        if (filled($shipment->recipient_city)) {
            return false;
        }

        $city = $this->resolveZoneCity($shipment->recipient_zone)
            ?? $this->defaultRecipientCity();

        if (! filled($city)) {
            return false;
        }

        $shipment->recipient_city = $city;

        return true;
    }

    private function addressContextChanged(Shipment $shipment): bool
    {
        return $shipment->isDirty('recipient_address')
            || $shipment->isDirty('recipient_city')
            || $shipment->isDirty('recipient_zone');
    }

    private function resolveZoneCity(?string $zoneName): ?string
    {
        if (! filled($zoneName) || ! Schema::hasTable('zones')) {
            return null;
        }

        $slug = Str::slug((string) $zoneName);

        if ($slug === '') {
            return null;
        }

        $city = Zone::query()
            ->where('slug', $slug)
            ->orderByDesc('is_active')
            ->orderBy('id')
            ->value('city');

        return filled($city) ? trim((string) $city) : null;
    }

    private function applyZoneCentroidFallback(Shipment $shipment): bool
    {
        if ($shipment->hasRecipientCoordinates() || ! Schema::hasTable('zones') || ! filled($shipment->recipient_zone)) {
            return $this->applyDirectZoneGeocodeFallback($shipment);
        }

        $slug = Str::slug((string) $shipment->recipient_zone);

        if ($slug === '') {
            return false;
        }

        $zone = Zone::query()
            ->where('slug', $slug)
            ->orderByDesc('is_active')
            ->orderBy('id')
            ->first(['name', 'city', 'lat_min', 'lat_max', 'lng_min', 'lng_max']);

        if (! $zone) {
            return $this->applyDirectZoneGeocodeFallback($shipment);
        }

        foreach ([$zone->lat_min, $zone->lat_max, $zone->lng_min, $zone->lng_max] as $value) {
            if (! is_numeric($value)) {
                return $this->applyZoneNameGeocodeFallback($shipment, $zone->name ?? $shipment->recipient_zone, $zone->city ?? $shipment->recipient_city);
            }
        }

        $shipment->recipient_lat = round((((float) $zone->lat_min) + ((float) $zone->lat_max)) / 2, 7);
        $shipment->recipient_lng = round((((float) $zone->lng_min) + ((float) $zone->lng_max)) / 2, 7);
        $shipment->geocoded_at = now();

        return true;
    }

    private function applyDirectZoneGeocodeFallback(Shipment $shipment): bool
    {
        if ($shipment->hasRecipientCoordinates() || ! filled($shipment->recipient_zone)) {
            return false;
        }

        return $this->applyZoneNameGeocodeFallback(
            $shipment,
            $shipment->recipient_zone,
            $shipment->recipient_city,
        );
    }

    private function applyZoneNameGeocodeFallback(Shipment $shipment, ?string $zoneName, ?string $city): bool
    {
        if ($shipment->hasRecipientCoordinates() || ! filled($zoneName)) {
            return false;
        }

        $resolvedCity = filled($city)
            ? trim((string) $city)
            : ($this->resolveZoneCity($zoneName) ?? $this->defaultRecipientCity());

        if (! filled($resolvedCity)) {
            return false;
        }

        $coords = App::make(GeocodingService::class)->geocode((string) $zoneName, $resolvedCity);

        if (! $coords) {
            return false;
        }

        $shipment->recipient_lat = $coords['lat'];
        $shipment->recipient_lng = $coords['lng'];
        $shipment->geocoded_at = now();

        if (! filled($shipment->recipient_city)) {
            $shipment->recipient_city = $resolvedCity;
        }

        return true;
    }

    private function applyCityGeocodeFallback(Shipment $shipment): bool
    {
        if ($shipment->hasRecipientCoordinates()) {
            return false;
        }

        $resolvedCity = filled($shipment->recipient_city)
            ? trim((string) $shipment->recipient_city)
            : ($this->resolveZoneCity($shipment->recipient_zone) ?? $this->defaultRecipientCity());

        if (! filled($resolvedCity)) {
            return false;
        }

        $coords = App::make(GeocodingService::class)->geocode($resolvedCity, $resolvedCity);

        if (! $coords) {
            return false;
        }

        $shipment->recipient_lat = $coords['lat'];
        $shipment->recipient_lng = $coords['lng'];
        $shipment->geocoded_at = now();

        if (! filled($shipment->recipient_city)) {
            $shipment->recipient_city = $resolvedCity;
        }

        return true;
    }

    private function defaultRecipientCity(): ?string
    {
        $city = trim((string) config('services.google.default_recipient_city', 'Bogota'));

        return $city !== '' ? $city : null;
    }
}
