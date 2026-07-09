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
        $zoneResolved = $this->applyRecipientZoneFallbackFromAddress($shipment);
        $this->normalizeLocationContext($shipment);
        $cityResolved = $this->applyRecipientCityFallback($shipment);
        if (! $this->supportsCoordinateColumns()) {
            return [
                'zone_resolved' => $zoneResolved,
                'city_resolved' => $cityResolved,
                'coordinates_cleared' => false,
                'geocoded' => false,
            ];
        }

        $coordinatesNormalized = $this->normalizeCoordinatePair($shipment);
        $coordinatesCleared = false;
        $geocoded = false;

        if ($shipment->hasValidManualCoordinates()) {
            if ($this->supportsGeocodedAtColumn()) {
                $shipment->geocoded_at = $shipment->geocoded_at ?? now();
            }

            return [
                'zone_resolved' => $zoneResolved,
                'city_resolved' => $cityResolved,
                'coordinates_cleared' => $coordinatesNormalized,
                'geocoded' => false,
            ];
        }

        if (! $shipment->coordinatesMissing() && ! $addressContextChanged) {
            return [
                'zone_resolved' => $zoneResolved,
                'city_resolved' => $cityResolved,
                'coordinates_cleared' => $coordinatesNormalized,
                'geocoded' => false,
            ];
        }

        if (! $shipment->geocodingEligible()) {
            $zoneFallbackApplied = $this->canApproximateFromContext($shipment)
                ? $this->applyZoneCentroidFallback($shipment)
                : false;

            return [
                'zone_resolved' => $zoneResolved,
                'city_resolved' => $cityResolved,
                'coordinates_cleared' => $coordinatesNormalized,
                'geocoded' => $zoneFallbackApplied,
            ];
        }

        if ($addressContextChanged && $shipment->hasRecipientCoordinates()) {
            $this->clearCoordinates($shipment);
            $coordinatesCleared = true;
        }

        $geocoded = $shipment->attemptGeocoding();

        if (! $geocoded) {
            $geocoded = $this->canApproximateFromContext($shipment)
                ? $this->applyZoneCentroidFallback($shipment)
                : false;
        }

        if (! $geocoded) {
            $geocoded = $this->canApproximateFromContext($shipment)
                ? $this->applyHistoricalClusterFallback($shipment)
                : false;
        }

        if (! $geocoded) {
            $geocoded = $this->canApproximateFromContext($shipment)
                ? $this->applyCityGeocodeFallback($shipment)
                : false;
        }

        if (! $geocoded) {
            $geocoded = $this->canApproximateFromContext($shipment)
                ? $this->applyStaticAnchorFallback($shipment)
                : false;
        }

        return [
            'zone_resolved' => $zoneResolved,
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

    private function canApproximateFromContext(Shipment $shipment): bool
    {
        $address = trim((string) ($shipment->recipient_address ?? ''));

        if ($address === '' || mb_strlen($address) < 8) {
            return false;
        }

        if ($this->addressHasLocatableReference($address)) {
            return true;
        }

        return filled($shipment->recipient_zone);
    }

    private function addressHasLocatableReference(string $address): bool
    {
        if (preg_match('/\d/', $address) === 1) {
            return true;
        }

        return preg_match('/\b(km|kilometro|kilómetro|vereda|via|vía|finca|lote|manzana|etapa|sector|barrio|parcela|parcelacion|parcelación)\b/i', $address) === 1;
    }

    private function normalizeCoordinatePair(Shipment $shipment): bool
    {
        $hasLat = is_numeric($shipment->recipient_lat);
        $hasLng = is_numeric($shipment->recipient_lng);

        if ($hasLat === $hasLng) {
            return false;
        }

        $this->clearCoordinates($shipment);

        return true;
    }

    public function applyRecipientCityFallback(Shipment $shipment): bool
    {
        if (filled($shipment->recipient_city)) {
            if (filled($shipment->recipient_zone)) {
                $sameAsZone = Str::slug((string) $shipment->recipient_city) === Str::slug((string) $shipment->recipient_zone);
                $zoneCity = $this->resolveZoneCity($shipment->recipient_zone);

                if ($sameAsZone && filled($zoneCity) && Str::slug((string) $zoneCity) !== Str::slug((string) $shipment->recipient_city)) {
                    $shipment->recipient_city = $zoneCity;

                    return true;
                }
            }

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

    public function applyRecipientZoneFallbackFromAddress(Shipment $shipment): bool
    {
        if (filled($shipment->recipient_zone) || ! filled($shipment->recipient_address) || ! Schema::hasTable('zones')) {
            return false;
        }

        $addressSearch = ' '.str_replace('-', ' ', Str::slug((string) $shipment->recipient_address)).' ';

        if (trim($addressSearch) === '') {
            return false;
        }

        $zone = Zone::query()
            ->orderByDesc('is_active')
            ->get(['name', 'slug', 'city'])
            ->sortByDesc(fn (Zone $zone) => mb_strlen((string) ($zone->slug ?: Str::slug((string) $zone->name))))
            ->first(function (Zone $zone) use ($addressSearch) {
                $slug = trim((string) ($zone->slug ?: Str::slug((string) $zone->name)));

                if ($slug === '') {
                    return false;
                }

                $needle = ' '.str_replace('-', ' ', $slug).' ';

                return str_contains($addressSearch, $needle);
            });

        if (! $zone) {
            return false;
        }

        $shipment->recipient_zone = $zone->name;

        if (! filled($shipment->recipient_city) && filled($zone->city)) {
            $shipment->recipient_city = trim((string) $zone->city);
        }

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

        $this->setCoordinates(
            $shipment,
            round((((float) $zone->lat_min) + ((float) $zone->lat_max)) / 2, 7),
            round((((float) $zone->lng_min) + ((float) $zone->lng_max)) / 2, 7),
        );

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

        $this->setCoordinates($shipment, $coords['lat'], $coords['lng']);

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

        $this->setCoordinates($shipment, $coords['lat'], $coords['lng']);

        if (! filled($shipment->recipient_city)) {
            $shipment->recipient_city = $resolvedCity;
        }

        return true;
    }

    private function applyHistoricalClusterFallback(Shipment $shipment): bool
    {
        if ($shipment->hasRecipientCoordinates()) {
            return false;
        }

        $anchor = $this->resolveApproximateAnchorFromHistory($shipment);

        if (! $anchor) {
            return false;
        }

        $coords = $this->offsetApproximateCoordinates(
            $anchor,
            $this->shipmentApproximationKey($shipment),
        );

        $this->setCoordinates($shipment, $coords['lat'], $coords['lng']);

        return true;
    }

    private function applyStaticAnchorFallback(Shipment $shipment): bool
    {
        if ($shipment->hasRecipientCoordinates()) {
            return false;
        }

        $anchor = $this->resolveKnownAnchor($shipment->recipient_zone, $shipment->recipient_city);

        if (! $anchor) {
            return false;
        }

        $coords = $this->offsetApproximateCoordinates(
            $anchor,
            $this->shipmentApproximationKey($shipment),
        );

        $this->setCoordinates($shipment, $coords['lat'], $coords['lng']);

        if (! filled($shipment->recipient_city) && filled($anchor['city'] ?? null)) {
            $shipment->recipient_city = $anchor['city'];
        }

        return true;
    }

    /**
     * @return array{lat: float, lng: float, radius_lat: float, radius_lng: float, city?: string}|null
     */
    private function resolveApproximateAnchorFromHistory(Shipment $shipment): ?array
    {
        $zone = filled($shipment->recipient_zone) ? trim((string) $shipment->recipient_zone) : null;
        $city = filled($shipment->recipient_city) ? trim((string) $shipment->recipient_city) : null;

        if ($zone && $city) {
            $anchor = $this->historicalAnchor([
                'recipient_zone' => $zone,
                'recipient_city' => $city,
            ]);

            if ($anchor) {
                return $anchor + [
                    'radius_lat' => 0.0025,
                    'radius_lng' => 0.0035,
                    'city' => $city,
                ];
            }
        }

        if ($zone) {
            $anchor = $this->historicalAnchor([
                'recipient_zone' => $zone,
            ]);

            if ($anchor) {
                return $anchor + [
                    'radius_lat' => 0.0035,
                    'radius_lng' => 0.0048,
                    'city' => $city,
                ];
            }
        }

        if ($city) {
            $anchor = $this->historicalAnchor([
                'recipient_city' => $city,
            ]);

            if ($anchor) {
                return $anchor + [
                    'radius_lat' => 0.006,
                    'radius_lng' => 0.008,
                    'city' => $city,
                ];
            }
        }

        return null;
    }

    /**
     * @param  array{recipient_zone?: string, recipient_city?: string}  $filters
     * @return array{lat: float, lng: float}|null
     */
    private function historicalAnchor(array $filters): ?array
    {
        $query = Shipment::query()
            ->whereNotNull('recipient_lat')
            ->whereNotNull('recipient_lng')
            ->orderByDesc('id');

        if (filled($filters['recipient_zone'] ?? null)) {
            $query->where('recipient_zone', $filters['recipient_zone']);
        }

        if (filled($filters['recipient_city'] ?? null)) {
            $query->where('recipient_city', $filters['recipient_city']);
        }

        $rows = $query
            ->limit(40)
            ->get(['recipient_lat', 'recipient_lng']);

        if ($rows->isEmpty()) {
            return null;
        }

        return [
            'lat' => round((float) $rows->avg('recipient_lat'), 7),
            'lng' => round((float) $rows->avg('recipient_lng'), 7),
        ];
    }

    /**
     * @return array{lat: float, lng: float, radius_lat: float, radius_lng: float, city?: string}|null
     */
    private function resolveKnownAnchor(?string $zone, ?string $city): ?array
    {
        $zoneSlug = Str::slug((string) $zone);
        $citySlug = Str::slug((string) $city);

        $knownZones = [
            'antonio-narino' => ['lat' => 4.5941, 'lng' => -74.1014, 'city' => 'Bogota'],
            'barrios-unidos' => ['lat' => 4.6696, 'lng' => -74.0725, 'city' => 'Bogota'],
            'bosa' => ['lat' => 4.6141, 'lng' => -74.1889, 'city' => 'Bogota'],
            'candelaria' => ['lat' => 4.5964, 'lng' => -74.0725, 'city' => 'Bogota'],
            'chapinero' => ['lat' => 4.6486, 'lng' => -74.0628, 'city' => 'Bogota'],
            'ciudad-bolivar' => ['lat' => 4.5076, 'lng' => -74.1613, 'city' => 'Bogota'],
            'engativa' => ['lat' => 4.7018, 'lng' => -74.1131, 'city' => 'Bogota'],
            'fontibon' => ['lat' => 4.6785, 'lng' => -74.1411, 'city' => 'Bogota'],
            'kennedy' => ['lat' => 4.6271, 'lng' => -74.1531, 'city' => 'Bogota'],
            'los-martires' => ['lat' => 4.6065, 'lng' => -74.0903, 'city' => 'Bogota'],
            'martires' => ['lat' => 4.6065, 'lng' => -74.0903, 'city' => 'Bogota'],
            'puente-aranda' => ['lat' => 4.615, 'lng' => -74.1035, 'city' => 'Bogota'],
            'rafael-uribe-uribe' => ['lat' => 4.5653, 'lng' => -74.1111, 'city' => 'Bogota'],
            'san-cristobal' => ['lat' => 4.5468, 'lng' => -74.0902, 'city' => 'Bogota'],
            'santa-fe' => ['lat' => 4.6028, 'lng' => -74.0695, 'city' => 'Bogota'],
            'soacha' => ['lat' => 4.5794, 'lng' => -74.2168, 'city' => 'Soacha'],
            'suba' => ['lat' => 4.743, 'lng' => -74.0867, 'city' => 'Bogota'],
            'sumapaz' => ['lat' => 4.0957, 'lng' => -74.3308, 'city' => 'Bogota'],
            'teusaquillo' => ['lat' => 4.6453, 'lng' => -74.0855, 'city' => 'Bogota'],
            'tunjuelito' => ['lat' => 4.5752, 'lng' => -74.1383, 'city' => 'Bogota'],
            'usaquen' => ['lat' => 4.7059, 'lng' => -74.0315, 'city' => 'Bogota'],
            'usme' => ['lat' => 4.4776, 'lng' => -74.11, 'city' => 'Bogota'],
        ];

        if ($zoneSlug !== '' && isset($knownZones[$zoneSlug])) {
            return $knownZones[$zoneSlug] + [
                'radius_lat' => 0.0035,
                'radius_lng' => 0.0048,
            ];
        }

        $knownCities = [
            'bogota' => ['lat' => 4.711, 'lng' => -74.0721, 'city' => 'Bogota'],
            'soacha' => ['lat' => 4.5794, 'lng' => -74.2168, 'city' => 'Soacha'],
            'medellin' => ['lat' => 6.2442, 'lng' => -75.5812, 'city' => 'Medellin'],
            'cali' => ['lat' => 3.4516, 'lng' => -76.532, 'city' => 'Cali'],
            'barranquilla' => ['lat' => 10.9878, 'lng' => -74.7889, 'city' => 'Barranquilla'],
            'cartagena' => ['lat' => 10.391, 'lng' => -75.4794, 'city' => 'Cartagena'],
            'bucaramanga' => ['lat' => 7.1193, 'lng' => -73.1227, 'city' => 'Bucaramanga'],
        ];

        if ($citySlug !== '' && isset($knownCities[$citySlug])) {
            return $knownCities[$citySlug] + [
                'radius_lat' => 0.012,
                'radius_lng' => 0.016,
            ];
        }

        $defaultCity = $this->defaultRecipientCity();
        $defaultSlug = Str::slug((string) $defaultCity);

        if ($defaultSlug !== '' && isset($knownCities[$defaultSlug])) {
            return $knownCities[$defaultSlug] + [
                'radius_lat' => 0.015,
                'radius_lng' => 0.02,
            ];
        }

        return null;
    }

    /**
     * @param  array{lat: float, lng: float, radius_lat: float, radius_lng: float}  $anchor
     * @return array{lat: float, lng: float}
     */
    private function offsetApproximateCoordinates(array $anchor, string $key): array
    {
        $hash = md5($key);
        $latPercent = hexdec(substr($hash, 0, 8)) / 0xffffffff;
        $lngPercent = hexdec(substr($hash, 8, 8)) / 0xffffffff;

        $latOffset = (($latPercent * 2) - 1) * ($anchor['radius_lat'] / 2);
        $lngOffset = (($lngPercent * 2) - 1) * ($anchor['radius_lng'] / 2);

        return [
            'lat' => round((float) $anchor['lat'] + $latOffset, 7),
            'lng' => round((float) $anchor['lng'] + $lngOffset, 7),
        ];
    }

    private function shipmentApproximationKey(Shipment $shipment): string
    {
        $parts = [
            Str::slug((string) $shipment->recipient_city),
            Str::slug((string) $shipment->recipient_zone),
            Str::slug((string) $shipment->recipient_address),
            Str::slug((string) $shipment->recipient_name),
            Str::slug((string) $shipment->recipient_phone),
        ];

        return implode('|', array_filter($parts, fn (?string $part) => filled($part)));
    }

    private function supportsCoordinateColumns(): bool
    {
        if (App::environment('testing')) {
            return Schema::hasColumn('shipments', 'recipient_lat')
                && Schema::hasColumn('shipments', 'recipient_lng');
        }

        static $supported = null;

        if ($supported !== null) {
            return $supported;
        }

        $supported = Schema::hasColumn('shipments', 'recipient_lat')
            && Schema::hasColumn('shipments', 'recipient_lng');

        return $supported;
    }

    private function supportsGeocodedAtColumn(): bool
    {
        if (App::environment('testing')) {
            return Schema::hasColumn('shipments', 'geocoded_at');
        }

        static $supported = null;

        if ($supported !== null) {
            return $supported;
        }

        $supported = Schema::hasColumn('shipments', 'geocoded_at');

        return $supported;
    }

    private function setCoordinates(Shipment $shipment, float $lat, float $lng): void
    {
        if (! $this->supportsCoordinateColumns()) {
            return;
        }

        $shipment->recipient_lat = $lat;
        $shipment->recipient_lng = $lng;

        if ($this->supportsGeocodedAtColumn()) {
            $shipment->geocoded_at = now();
        }
    }

    private function clearCoordinates(Shipment $shipment): void
    {
        if (! $this->supportsCoordinateColumns()) {
            return;
        }

        $shipment->recipient_lat = null;
        $shipment->recipient_lng = null;

        if ($this->supportsGeocodedAtColumn()) {
            $shipment->geocoded_at = null;
        }
    }

    private function defaultRecipientCity(): ?string
    {
        $city = trim((string) config('services.google.default_recipient_city', 'Bogota'));

        return $city !== '' ? $city : null;
    }
}
