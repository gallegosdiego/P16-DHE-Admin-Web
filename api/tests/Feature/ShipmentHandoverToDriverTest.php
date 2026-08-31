<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Entrega directa del paquete al piloto desde el panel, sin exigir ruta
 * (QA del 31/08: en bodega el paquete se entrega en mano cuando el piloto
 * llega, tenga o no armada su ruta del dia).
 */
class ShipmentHandoverToDriverTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Driver $driver;

    private Client $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->seed(DemoDataSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();
        $this->driver = Driver::where('status', 'active')->firstOrFail();
        $this->client = Client::firstOrFail();
    }

    public function test_handover_records_custody_for_the_assigned_driver_without_a_route(): void
    {
        $shipment = $this->createShipmentInHubCustody(['driver_id' => $this->driver->id]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/handover-to-driver", [
                'notes' => 'Piloto recibio el paquete en mostrador; escaner no disponible.',
            ], ['Idempotency-Key' => 'handover-01'])
            ->assertOk()
            ->assertJsonPath('custody.new_custodian_type', 'driver')
            ->assertJsonPath('custody.new_custodian_id', $this->driver->id);

        $this->assertDatabaseHas('custody_events', [
            'shipment_id' => $shipment->id,
            'event_type' => 'assigned_to_driver',
            'new_custodian_type' => 'driver',
            'new_custodian_id' => $this->driver->id,
        ]);
    }

    public function test_handover_requires_an_assigned_driver(): void
    {
        $shipment = $this->createShipmentInHubCustody(['driver_id' => null]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/handover-to-driver", [
                'notes' => 'Entrega sin piloto asignado.',
            ], ['Idempotency-Key' => 'handover-02'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['driver']);
    }

    public function test_handover_requires_hub_custody(): void
    {
        // Sin ningun evento de custodia: dato historico o flujo incompleto.
        $shipment = $this->createShipment(['driver_id' => $this->driver->id]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/handover-to-driver", [
                'notes' => 'Paquete sin cadena de custodia.',
            ], ['Idempotency-Key' => 'handover-03'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['custody']);
    }

    public function test_handover_requires_a_note(): void
    {
        $shipment = $this->createShipmentInHubCustody(['driver_id' => $this->driver->id]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/handover-to-driver", [], ['Idempotency-Key' => 'handover-04'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['notes']);
    }

    public function test_repeating_the_handover_is_harmless(): void
    {
        $shipment = $this->createShipmentInHubCustody(['driver_id' => $this->driver->id]);

        foreach (['handover-05a', 'handover-05b'] as $key) {
            $this->actingAs($this->admin, 'sanctum')
                ->postJson("/api/shipments/{$shipment->id}/handover-to-driver", [
                    'notes' => 'Entrega en mostrador.',
                ], ['Idempotency-Key' => $key])
                ->assertOk();
        }

        $this->assertSame(1, CustodyEvent::query()
            ->where('shipment_id', $shipment->id)
            ->where('event_type', 'assigned_to_driver')
            ->count());
    }

    private function createShipmentInHubCustody(array $overrides = []): Shipment
    {
        $shipment = $this->createShipment($overrides);

        CustodyEvent::create([
            'shipment_id' => $shipment->id,
            'event_type' => 'received_at_hub',
            'new_custodian_type' => 'hub',
            'new_custodian_id' => 1,
            'new_custodian_name' => 'Sede principal',
            'occurred_at' => now(),
        ]);

        return $shipment;
    }

    private function createShipment(array $overrides = []): Shipment
    {
        $sequence = ((int) Shipment::withTrashed()->max('sequence_number')) + 1;

        return Shipment::create(array_merge([
            'client_id' => $this->client->id,
            'created_by' => $this->admin->id,
            'tracking_code' => sprintf('HND%014d', $sequence),
            'display_code' => sprintf('#HND%05d', $sequence),
            'sequence_number' => $sequence,
            'status' => 'in_warehouse',
            'recipient_name' => 'Destinatario Entrega',
            'recipient_phone' => '3000000000',
            'recipient_address' => 'Calle 10 # 20-30',
            'recipient_city' => 'Bogotá',
            'payment_type' => 'post_sale',
            'shipping_cost' => 12500,
            'cod_amount' => 0,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ], $overrides));
    }
}
