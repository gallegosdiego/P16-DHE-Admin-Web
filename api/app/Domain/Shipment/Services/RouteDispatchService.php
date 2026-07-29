<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shipment\Actions\TransitionShipmentStatus;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shared\Services\IdempotencyService;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RouteDispatchService
{
    public function __construct(
        private readonly CustodyRecorder $custody,
        private readonly TransitionShipmentStatus $transitionShipmentStatus,
        private readonly IdempotencyService $idempotency,
    ) {}

    /**
     * Confirma el traspaso de un paquete de la sede al piloto responsable.
     *
     * La llave de idempotencia evita duplicar el evento cuando el celular
     * reintenta el mismo escaneo por falta de red.
     *
     * @param array{source: string, scan_code?: string|null, physical_condition?: string|null, notes?: string|null, lat?: float|null, lng?: float|null} $payload
     */
    public function handover(
        Route $route,
        RouteStop $stop,
        User $actor,
        array $payload,
        string $scope,
        string $idempotencyKey,
    ): RouteStop {
        return $this->idempotency->runForModel(
            $scope,
            $idempotencyKey,
            'route_stop_handover',
            $payload,
            fn () => $this->perform($route, $stop, $actor, $payload),
        );
    }

    /** @param array{source: string, scan_code?: string|null, physical_condition?: string|null, notes?: string|null, lat?: float|null, lng?: float|null} $payload */
    private function perform(Route $route, RouteStop $stop, User $actor, array $payload): RouteStop
    {
        return DB::transaction(function () use ($route, $stop, $actor, $payload) {
            $lockedRoute = Route::query()
                ->lockForUpdate()
                ->with('driver')
                ->findOrFail($route->id);

            $lockedStop = RouteStop::query()
                ->lockForUpdate()
                ->with('shipment')
                ->whereKey($stop->id)
                ->where('route_id', $lockedRoute->id)
                ->firstOrFail();

            if (! in_array($lockedRoute->status, ['planned', 'active'], true)) {
                throw ValidationException::withMessages([
                    'route' => 'La jornada ya esta cerrada y no acepta nuevos traspasos.',
                ]);
            }

            if ($lockedStop->status !== 'pending') {
                throw ValidationException::withMessages([
                    'stop' => 'La parada ya fue cerrada y no puede volver a escanearse.',
                ]);
            }

            /** @var Shipment $shipment */
            $shipment = Shipment::query()->lockForUpdate()->findOrFail($lockedStop->shipment_id);
            $this->assertScanCode($shipment, $payload['scan_code'] ?? null, $payload['source']);

            $latestCustody = CustodyEvent::query()
                ->where('shipment_id', $shipment->id)
                ->latest('occurred_at')
                ->latest('id')
                ->first();

            if ($latestCustody?->new_custodian_type === 'driver'
                && (int) $latestCustody->new_custodian_id === (int) $lockedRoute->driver_id) {
                return $lockedStop->fresh(['shipment']);
            }

            if ($latestCustody === null || $latestCustody->new_custodian_type !== 'hub') {
                throw ValidationException::withMessages([
                    'custody' => 'El paquete no figura bajo custodia de una sede Danhei.',
                ]);
            }

            $rawStatus = (string) $shipment->getRawOriginal('status');
            if (! in_array($rawStatus, [
                ShipmentStatus::IN_WAREHOUSE->value,
                ShipmentStatus::ASSIGNED_TO_ROUTE->value,
                ShipmentStatus::IN_TRANSIT->value,
            ], true)) {
                throw ValidationException::withMessages([
                    'shipment' => 'El estado del paquete no permite entregarlo al piloto.',
                ]);
            }

            $this->advanceShipmentStatus($shipment, $lockedRoute, $actor);

            $this->custody->record($shipment, [
                'event_type' => 'assigned_to_driver',
                'new_custodian_type' => 'driver',
                'new_custodian_id' => $lockedRoute->driver_id,
                'new_custodian_name' => $lockedRoute->driver?->name,
                'physical_condition' => $payload['physical_condition'] ?? null,
                'actor_user_id' => $actor->id,
                'lat' => $payload['lat'] ?? null,
                'lng' => $payload['lng'] ?? null,
                'metadata_json' => [
                    'route_id' => $lockedRoute->id,
                    'route_stop_id' => $lockedStop->id,
                    'source' => $payload['source'],
                    'scan_code' => $payload['scan_code'] ?? null,
                    'notes' => $payload['notes'] ?? null,
                ],
            ]);

            return $lockedStop->fresh(['shipment']);
        });
    }

    private function assertScanCode(Shipment $shipment, ?string $scanCode, string $source): void
    {
        $normalizedScan = $this->normalizeCode($scanCode);

        if ($source === 'pilot_scan' && $normalizedScan === '') {
            throw ValidationException::withMessages([
                'scan_code' => 'El escaneo del piloto debe incluir la guia leida.',
            ]);
        }

        if ($normalizedScan === '') {
            return;
        }

        $knownCodes = array_filter([
            $this->normalizeCode($shipment->tracking_code),
            $this->normalizeCode($shipment->display_code),
        ]);

        if (! in_array($normalizedScan, $knownCodes, true)) {
            throw ValidationException::withMessages([
                'scan_code' => 'La guia escaneada no corresponde a esta parada.',
            ]);
        }
    }

    private function normalizeCode(?string $value): string
    {
        return strtoupper(ltrim(trim((string) $value), '#'));
    }

    private function advanceShipmentStatus(Shipment $shipment, Route $route, User $actor): void
    {
        $status = $shipment->status;

        if ($status instanceof ShipmentStatus && in_array($status, [
            ShipmentStatus::PICKED_UP,
            ShipmentStatus::IN_WAREHOUSE,
        ], true)) {
            $shipment = $this->transitionShipmentStatus->execute(
                $shipment,
                ShipmentStatus::ASSIGNED_TO_ROUTE,
                $actor,
                'Paquete entregado al despacho del piloto.',
                ['route_id' => $route->id, 'action' => 'route_stop_handover'],
            );
        }

        if ($route->status === 'active' && $shipment->status === ShipmentStatus::ASSIGNED_TO_ROUTE) {
            $this->transitionShipmentStatus->execute(
                $shipment,
                ShipmentStatus::IN_TRANSIT,
                $actor,
                'Paquete entregado al piloto con la ruta activa.',
                ['route_id' => $route->id, 'action' => 'route_stop_handover'],
            );
        }
    }
}
