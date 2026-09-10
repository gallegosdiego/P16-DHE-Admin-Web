<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Services\CustodyRecorder;
use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * La hora del celular del piloto llega en UTC y la operación vive en
 * America/Bogota. Guardarla cruda dejaba cada escaneo cinco horas en el
 * futuro y, como la custodia anterior se resuelve por `occurred_at`, ese
 * evento futuro ganaba siempre: un paquete devuelto a bodega seguía
 * figurando en la moto del piloto y no volvía al tablero de despacho.
 */
class CustodyOccurredAtTimezoneTest extends TestCase
{
    use RefreshDatabase;

    private function shipment(): Shipment
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->seed(DemoDataSeeder::class);

        return Shipment::withoutEvents(fn () => Shipment::create([
            'client_id' => Client::firstOrFail()->id,
            'created_by' => User::where('email', 'admin@danheiexpress.com')->firstOrFail()->id,
            'tracking_code' => 'TZCUSTODY001',
            'display_code' => '#TZCUSTODY001',
            'sequence_number' => 990001,
            'status' => 'in_warehouse',
            'recipient_name' => 'Destinatario Zona Horaria',
            'recipient_phone' => '3001112233',
            'recipient_address' => 'Calle 1 #1-1',
            'recipient_city' => 'Bogotá',
            'payment_type' => 'prepaid',
            'shipping_cost' => 1000,
        ]));
    }

    public function test_la_hora_utc_del_celular_se_guarda_en_la_zona_de_la_operacion(): void
    {
        $shipment = $this->shipment();

        $event = app(CustodyRecorder::class)->record($shipment, [
            'event_type' => 'assigned_to_driver',
            'new_custodian_type' => 'driver',
            'new_custodian_id' => 1,
            'occurred_at' => now()->utc()->toIso8601String(),
        ]);

        // Guardado en hora de la operación: nunca en el futuro contra now().
        $this->assertLessThanOrEqual(
            now()->addMinute()->timestamp,
            $event->occurred_at->timestamp,
            'El evento del celular quedó en el futuro: la hora UTC no se normalizó.'
        );
    }

    public function test_una_devolucion_posterior_queda_como_custodia_vigente(): void
    {
        $shipment = $this->shipment();
        $recorder = app(CustodyRecorder::class);

        // El piloto escanea con su celular: la hora llega en UTC.
        $recorder->record($shipment, [
            'event_type' => 'assigned_to_driver',
            'new_custodian_type' => 'driver',
            'new_custodian_id' => 1,
            'occurred_at' => now()->utc()->toIso8601String(),
        ]);

        // Minutos después el mostrador registra la devolución DESDE EL PANEL,
        // que sella la hora local del servidor. Esta mezcla de orígenes es la
        // que rompía: el evento del celular quedaba cinco horas por delante.
        $recorder->record($shipment, [
            'event_type' => 'returned_by_driver',
            'new_custodian_type' => 'hub',
            'new_custodian_id' => null,
            'occurred_at' => now()->addMinutes(3),
        ]);

        $latest = $shipment->custodyEvents()->latest('occurred_at')->latest('id')->firstOrFail();

        $this->assertSame(
            'hub',
            $latest->new_custodian_type,
            'La devolución debe ser la custodia vigente; con horas sin normalizar ganaba el evento del piloto.'
        );
    }
}
