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
 * Asignacion masiva con atomicidad POR PAQUETE.
 *
 * En el mostrador, un paquete que ya esta en la moto de otro piloto no puede
 * tumbar la asignacion de los otros diecinueve: se rechaza solo, con su motivo,
 * y el operador ve exactamente cual fue.
 */
class BatchAssignCustodyTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Driver $driver;

    private Driver $otherDriver;

    private Client $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->seed(DemoDataSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();
        $drivers = Driver::where('status', 'active')->orderBy('id')->take(2)->get();
        $this->driver = $drivers->first();
        $this->otherDriver = $drivers->last();
        $this->client = Client::firstOrFail();
    }

    public function test_a_package_in_another_drivers_custody_does_not_block_the_rest(): void
    {
        $assignable = $this->createShipmentInHubCustody();
        $alsoAssignable = $this->createShipmentInHubCustody();
        $inOtherCustody = $this->createShipmentInDriverCustody($this->otherDriver);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments/batch-assign', [
                'shipment_ids' => [$assignable->id, $inOtherCustody->id, $alsoAssignable->id],
                'driver_id' => $this->driver->id,
            ]);

        $response->assertOk()
            ->assertJsonPath('updated', 2)
            ->assertJsonPath('rejected.0.shipment_id', $inOtherCustody->id);

        $this->assertSame(
            [$assignable->id, $alsoAssignable->id],
            $response->json('accepted'),
        );
        $this->assertStringContainsString('custodia', $response->json('rejected.0.reason'));

        // Los aceptados quedaron asignados de verdad; el rechazado conserva su piloto.
        $this->assertSame($this->driver->id, $assignable->fresh()->driver_id);
        $this->assertSame($this->driver->id, $alsoAssignable->fresh()->driver_id);
        $this->assertSame($this->otherDriver->id, $inOtherCustody->fresh()->driver_id);
    }

    public function test_a_clean_batch_still_reports_no_rejections(): void
    {
        $first = $this->createShipmentInHubCustody();
        $second = $this->createShipmentInHubCustody();

        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments/batch-assign', [
                'shipment_ids' => [$first->id, $second->id],
                'driver_id' => $this->driver->id,
            ])
            ->assertOk()
            ->assertJsonPath('updated', 2)
            ->assertJsonPath('rejected', []);
    }

    private function createShipmentInDriverCustody(Driver $driver): Shipment
    {
        $shipment = $this->createShipment(['driver_id' => $driver->id]);

        CustodyEvent::create([
            'shipment_id' => $shipment->id,
            'event_type' => 'assigned_to_driver',
            'previous_custodian_type' => 'hub',
            'previous_custodian_id' => 1,
            'new_custodian_type' => 'driver',
            'new_custodian_id' => $driver->id,
            'new_custodian_name' => $driver->name,
            'occurred_at' => now(),
        ]);

        return $shipment;
    }

    private function createShipmentInHubCustody(): Shipment
    {
        $shipment = $this->createShipment();

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
            'tracking_code' => sprintf('BAT%014d', $sequence),
            'display_code' => sprintf('#BAT%05d', $sequence),
            'sequence_number' => $sequence,
            'status' => 'in_warehouse',
            'recipient_name' => 'Destinatario Lote',
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
