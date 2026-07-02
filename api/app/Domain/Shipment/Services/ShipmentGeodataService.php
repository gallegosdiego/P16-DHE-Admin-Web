<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shared\Models\Zone;
use App\Domain\Shipment\Models\Shipment;
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
        $coordinatesCleared = false;
        $geocoded = false;

        if ($shipment->hasValidManualCoordinates()) {
            $shipment->geocoded_at = $shipment->geocoded_at ?? now();

            return [
                'city_resolved' => $cityResolved,
                'coordinates_cleared' => false,
                'geocoded' => false,
            ];
        }

        if (! $shipment->coordinatesMissing() && ! $addressContextChanged) {
            return [
                'city_resolved' => $cityResolved,
                'coordinates_cleared' => false,
                'geocoded' => false,
            ];
        }

        if (! $shipment->geocodingEligible()) {
            return [
                'city_resolved' => $cityResolved,
                'coordinates_cleared' => false,
                'geocoded' => false,
            ];
        }

        if ($addressContextChanged && $shipment->hasRecipientCoordinates()) {
            $shipment->recipient_lat = null;
            $shipment->recipient_lng = null;
            $shipment->geocoded_at = null;
            $coordinatesCleared = true;
        }

        $geocoded = $shipment->attemptGeocoding();

        return [
            'city_resolved' => $cityResolved,
            'coordinates_cleared' => $coordinatesCleared,
            'geocoded' => $geocoded,
        ];
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

    private function defaultRecipientCity(): ?string
    {
        $city = trim((string) config('services.google.default_recipient_city', 'Bogota'));

        return $city !== '' ? $city : null;
    }
}
