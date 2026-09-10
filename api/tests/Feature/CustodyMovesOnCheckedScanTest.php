<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Un paquete asignado a un piloto y todavía en la sede: al escanearlo, la
 * custodia TIENE que moverse.
 *
 * El defecto que cubre esta prueba: la correlación "chequeado" respondía
 * aceptado y retornaba antes de registrar custodia, así que el piloto se
 * llevaba el paquete y el sistema seguía creyendo que estaba en bodega. Se
 * encontró montando el escenario real, no con datos de laboratorio.
 */
class CustodyMovesOnCheckedScanTest extends TestCase
{
    use RefreshDatabase;

    private User $driverUser;

    private Driver $driver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->seed(DemoDataSeeder::class);

        $this->driver = Driver::query()->where('status', 'active')->orderBy('id')->firstOrFail();
        $this->driverUser = User::query()->create([
            'name' => 'Piloto Chequeo',
            'email' => 'checked-scan@danhei.test',
            'password' => bcrypt('Piloto2026!'),
            'driver_id' => $this->driver->id,
        ]);
        $this->driverUser->assignRole('driver');
        $this->driver->update(['user_id' => $this->driverUser->id]);
    }

    public function test_el_escaneo_de_un_paquete_asignado_mueve_la_custodia_a_la_moto(): void
    {
        $shipment = $this->shipmentInHub();
        $this->assignToOpenRoute($shipment);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->withHeader('Idempotency-Key', 'checked-'.Str::random(8))
            ->postJson('/api/driver/reception/confirm', [
                'device_id' => 'prueba-chequeo',
                'lat' => 4.60971,
                'lng' => -74.08175,
                'occurred_at' => now()->toIso8601String(),
                'packages' => [['scan_code' => $shipment->tracking_code]],
            ])
            ->assertOk();

        $this->assertSame('checked', $response->json('accepted.0.correlation'));

        $latest = CustodyEvent::query()
            ->where('shipment_id', $shipment->id)
            ->latest('occurred_at')->latest('id')->firstOrFail();

        $this->assertSame('driver', $latest->new_custodian_type, 'La custodia debe quedar en la moto del piloto.');
        $this->assertSame($this->driver->id, (int) $latest->new_custodian_id);
        $this->assertSame('handed_to_driver', $shipment->fresh()->getRawOriginal('status'));
    }

    public function test_reescanear_lo_que_ya_esta_en_la_moto_no_duplica_custodia(): void
    {
        $shipment = $this->shipmentInHub();
        $this->assignToOpenRoute($shipment);
        $headers = ['Idempotency-Key' => 'checked-'.Str::random(8)];
        $payload = [
            'device_id' => 'prueba-chequeo',
            'lat' => 4.60971,
            'lng' => -74.08175,
            'occurred_at' => now()->toIso8601String(),
            'packages' => [['scan_code' => $shipment->tracking_code]],
        ];

        $this->actingAs($this->driverUser, 'sanctum')
            ->withHeaders($headers)->postJson('/api/driver/reception/confirm', $payload)->assertOk();

        $eventosTrasElPrimero = CustodyEvent::query()->where('shipment_id', $shipment->id)->count();

        // Segundo escaneo, llave distinta: es el mismo paquete ya en su moto.
        $this->actingAs($this->driverUser, 'sanctum')
            ->withHeader('Idempotency-Key', 'checked-'.Str::random(8))
            ->postJson('/api/driver/reception/confirm', $payload)
            ->assertOk();

        $this->assertSame(
            $eventosTrasElPrimero,
            CustodyEvent::query()->where('shipment_id', $shipment->id)->count(),
            'Reescanear lo que ya está en la moto no debe registrar custodia nueva.'
        );
    }

    private function shipmentInHub(): Shipment
    {
        $shipment = Shipment::withoutEvents(fn () => Shipment::query()->create([
            'client_id' => Client::query()->firstOrFail()->id,
            'created_by' => User::query()->where('email', 'admin@danheiexpress.com')->value('id'),
            'tracking_code' => 'CHK'.Str::upper(Str::random(9)),
            'display_code' => '#CHK'.Str::upper(Str::random(5)),
            'sequence_number' => random_int(800000, 899999),
            'status' => 'in_warehouse',
            'recipient_name' => 'Destinatario Chequeo',
            'recipient_phone' => '3001112233',
            'recipient_address' => 'Calle 1 #1-1',
            'recipient_city' => 'Bogotá',
            'payment_type' => 'prepaid',
            'shipping_cost' => 1000,
        ]));

        CustodyEvent::query()->create([
            'shipment_id' => $shipment->id,
            'event_type' => 'received_at_hub',
            'new_custodian_type' => 'hub',
            'new_custodian_id' => 1,
            'new_custodian_name' => 'Sede principal',
            'occurred_at' => now()->subMinutes(5),
        ]);

        return $shipment;
    }

    private function assignToOpenRoute(Shipment $shipment): void
    {
        $route = Route::query()->create([
            'driver_id' => $this->driver->id,
            'route_date' => now()->toDateString(),
            'status' => 'planned',
            'total_stops' => 0,
            'completed_stops' => 0,
        ]);

        RouteStop::query()->create([
            'route_id' => $route->id,
            'shipment_id' => $shipment->id,
            'sort_order' => 1,
            'status' => 'pending',
        ]);
    }
}
