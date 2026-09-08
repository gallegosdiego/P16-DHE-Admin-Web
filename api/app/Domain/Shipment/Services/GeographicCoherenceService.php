<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shared\Models\Zone;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Support\Str;

/**
 * OT-A: Servicio de Verificación de Coherencia Geográfica.
 *
 * Determina si las coordenadas registradas de un envío coinciden con los límites
 * geográficos (bounding box) de su zona declarada.
 *
 * Principio rector: Cero efectos secundarios.
 * - No realiza escrituras ni mutaciones en la base de datos.
 * - No altera el estado de los modelos.
 * - No fuerza correcciones automáticas.
 *
 * Resultados posibles:
 * - 'coherente': Coordenadas dentro de la caja de la zona.
 * - 'fuera_de_zona': Coordenadas fuera de la caja de la zona.
 * - 'sin_datos': Falta de coordenadas, falta de zona, o zona sin bounding box configurado.
 */
class GeographicCoherenceService
{
    public const STATUS_COHERENTE = 'coherente';
    public const STATUS_FUERA_DE_ZONA = 'fuera_de_zona';
    public const STATUS_SIN_DATOS = 'sin_datos';

    /**
     * Verifica la coherencia geográfica de un modelo Shipment.
     *
     * @return array{status: string, reason: ?string, zone: ?string}
     */
    public function check(Shipment $shipment): array
    {
        $lat = is_numeric($shipment->recipient_lat) ? (float) $shipment->recipient_lat : null;
        $lng = is_numeric($shipment->recipient_lng) ? (float) $shipment->recipient_lng : null;

        return $this->checkCoordinates($lat, $lng, $shipment->recipient_zone);
    }

    /**
     * Verifica la coherencia geográfica a partir de valores escalares de latitud, longitud y nombre/slug de zona.
     *
     * @return array{status: string, reason: ?string, zone: ?string}
     */
    public function checkCoordinates(?float $lat, ?float $lng, ?string $zoneName): array
    {
        if ($lat === null || $lng === null) {
            return [
                'status' => self::STATUS_SIN_DATOS,
                'reason' => 'missing_coordinates',
                'zone'   => $zoneName,
            ];
        }

        $zoneStr = trim((string) $zoneName);
        if ($zoneStr === '') {
            return [
                'status' => self::STATUS_SIN_DATOS,
                'reason' => 'missing_zone',
                'zone'   => null,
            ];
        }

        $zone = $this->resolveZone($zoneStr);

        if (! $zone) {
            return [
                'status' => self::STATUS_SIN_DATOS,
                'reason' => 'zone_not_found',
                'zone'   => $zoneStr,
            ];
        }

        if (! $zone->hasBounds()) {
            return [
                'status' => self::STATUS_SIN_DATOS,
                'reason' => 'zone_without_bounds',
                'zone'   => $zone->name,
            ];
        }

        $isInside = $zone->containsCoordinates($lat, $lng);

        if ($isInside === true) {
            return [
                'status' => self::STATUS_COHERENTE,
                'reason' => null,
                'zone'   => $zone->name,
            ];
        }

        return [
            'status' => self::STATUS_FUERA_DE_ZONA,
            'reason' => 'coordinates_outside_zone_bounds',
            'zone'   => $zone->name,
        ];
    }

    /**
     * Resuelve un modelo Zone buscando por slug o nombre exacto.
     */
    public function resolveZone(string $zoneName): ?Zone
    {
        $slug = Str::slug($zoneName);

        if ($slug === '') {
            return null;
        }

        return Zone::query()
            ->where('slug', $slug)
            ->orWhere('name', $zoneName)
            ->first();
    }
}
