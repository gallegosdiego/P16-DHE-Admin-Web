<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Validation\ValidationException;

/**
 * Regla de negocio: un paquete solo cambia de piloto cuando otro piloto lo
 * escanea teniéndolo en la mano.
 *
 * Toda vía administrativa que toque `shipments.driver_id` (editar el envío,
 * asignar o des-asignar, agregar parada, crear o ampliar ruta, aplicar una
 * propuesta de despacho) pasa por aquí. Si la última custodia es de un piloto,
 * solo se acepta dejar el paquete con ese mismo piloto. Las entregas de sede a
 * piloto siguen permitidas porque en ese caso la custodia es de la sede.
 */
class CustodyGuard
{
    public function latest(Shipment|int $shipment): ?CustodyEvent
    {
        $shipmentId = $shipment instanceof Shipment ? (int) $shipment->getKey() : $shipment;

        return CustodyEvent::query()
            ->where('shipment_id', $shipmentId)
            ->latest('occurred_at')
            ->latest('id')
            ->first();
    }

    /**
     * Piloto que tiene físicamente el paquete según la última custodia.
     *
     * @return array{id:int,name:string}|null
     */
    public function holdingDriver(Shipment|int $shipment, ?CustodyEvent $latest = null): ?array
    {
        $latest ??= $this->latest($shipment);

        if ($latest?->new_custodian_type !== 'driver' || ! $latest->new_custodian_id) {
            return null;
        }

        return [
            'id' => (int) $latest->new_custodian_id,
            'name' => $this->driverName((int) $latest->new_custodian_id, $latest->new_custodian_name),
        ];
    }

    /**
     * Mensaje de rechazo si dejar el paquete con `$driverId` rompe la custodia.
     * `null` como destino significa "sin piloto".
     */
    public function violation(Shipment|int $shipment, ?int $driverId): ?string
    {
        $holder = $this->holdingDriver($shipment);

        if ($holder === null || ($driverId !== null && $holder['id'] === $driverId)) {
            return null;
        }

        return self::message($holder['name']);
    }

    public function assertDriverChangeAllowed(Shipment|int $shipment, ?int $driverId, string $field = 'driver_id'): void
    {
        $message = $this->violation($shipment, $driverId);

        if ($message !== null) {
            throw ValidationException::withMessages([$field => [$message]]);
        }
    }

    public static function message(string $holderName): string
    {
        return "Este paquete lo tiene {$holderName}. Solo cambia de piloto cuando otro piloto lo escanea.";
    }

    public function driverName(?int $driverId, ?string $fallback = null): string
    {
        $name = $driverId ? Driver::withTrashed()->whereKey($driverId)->value('name') : null;

        return trim((string) ($name ?: $fallback)) ?: 'otro piloto';
    }
}
