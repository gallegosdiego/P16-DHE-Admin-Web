<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RouteTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
        $response = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ]);
        $this->token = $response->json('token');
    }

    private function auth(): array
    {
        return ['Authorization' => "Bearer {$this->token}"];
    }

    private function shipmentIdsForDriver(Driver $driver, int $count): array
    {
        $client = Client::first();
        $ids = [];
        $sequence = (int) (Shipment::withTrashed()->max('sequence_number') ?? 0);

        for ($i = 0; $i < $count; $i++) {
            $sequence++;
            $shipment = Shipment::create([
                'client_id' => $client->id,
                'driver_id' => null,
                'created_by' => $this->admin->id,
                'tracking_code' => sprintf('TST%014d', $sequence),
                'display_code' => sprintf('#TST%05d', $sequence),
                'sequence_number' => $sequence,
                'status' => 'registered',
                'financial_status' => 'pending',
                'recipient_name' => "Cliente Test {$sequence}",
                'recipient_phone' => '3000000000',
                'recipient_address' => "Calle {$sequence} #10-20",
                'recipient_zone' => $driver->zone,
                'recipient_city' => 'Bogota',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 10000,
                'cod_amount' => 0,
                'driver_fee' => 3000,
            ]);

            $ids[] = $shipment->id;
        }

        return $ids;
    }

    public function test_list_routes_empty_day(): void
    {
        $response = $this->getJson('/api/routes?date=2099-01-01', $this->auth());
        $response->assertOk();
        $this->assertCount(0, $response->json());
    }

    public function test_create_route_with_shipments(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 2);

        // Si no hay envíos sin conductor, usar los primeros disponibles
        if (empty($shipments)) {
            $shipments = $this->shipmentIdsForDriver($driver, 2);
        }

        $response = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
            'zone' => 'Chapinero',
        ], $this->auth());

        $response->assertCreated();
        $this->assertEquals($driver->id, $response->json('driver_id'));
        $this->assertEquals(count($shipments), $response->json('total_stops'));
        $this->assertEquals(0, $response->json('completed_stops'));
        $this->assertEquals('planned', $response->json('status'));
    }

    public function test_cannot_create_duplicate_route(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 2);

        // Primera ruta — OK
        $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
        ], $this->auth())->assertCreated();

        // Segunda ruta mismo conductor y día — 422
        $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
        ], $this->auth())->assertUnprocessable();
    }

    public function test_show_route_detail(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 3);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
        ], $this->auth());

        $routeId = $create->json('id');

        $detail = $this->getJson("/api/routes/{$routeId}", $this->auth());
        $detail->assertOk();
        $detail->assertJsonStructure([
            'id', 'driver', 'route_date', 'status', 'progress', 'stops',
        ]);
        $this->assertCount(3, $detail->json('stops'));
    }

    public function test_start_route(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 2);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
        ], $this->auth());

        $routeId = $create->json('id');

        $start = $this->postJson("/api/routes/{$routeId}/start", [], $this->auth());
        $start->assertOk();
        $this->assertEquals('active', $start->json('status'));

        // Verificar que el conductor cambió a "route"
        $driver->refresh();
        $this->assertEquals('route', $driver->status);
    }

    public function test_complete_stop(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 2);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
        ], $this->auth());

        $routeId = $create->json('id');

        // Activar ruta primero
        $this->postJson("/api/routes/{$routeId}/start", [], $this->auth());

        // Completar primera parada
        $detail = $this->getJson("/api/routes/{$routeId}", $this->auth());
        $stopId = $detail->json('stops.0.id');

        $complete = $this->postJson("/api/routes/{$routeId}/stops/{$stopId}/complete", [], $this->auth());
        $complete->assertOk();
        $this->assertEquals(50, $complete->json('progress'));
    }

    public function test_complete_stop_preserves_issue_status(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 1);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
        ], $this->auth());

        $routeId = $create->json('id');

        $this->postJson("/api/routes/{$routeId}/start", [], $this->auth());

        $detail = $this->getJson("/api/routes/{$routeId}", $this->auth());
        $stopId = $detail->json('stops.0.id');
        $shipmentId = $detail->json('stops.0.shipment.id');

        $this->postJson("/api/shipments/{$shipmentId}/status", [
            'status' => 'issue',
            'description' => 'Cliente no disponible',
            'issue_note' => 'Cliente no disponible',
        ], $this->auth())->assertOk();

        $complete = $this->postJson("/api/routes/{$routeId}/stops/{$stopId}/complete", [], $this->auth());
        $complete->assertOk();

        $shipment = Shipment::findOrFail($shipmentId);
        $this->assertEquals('issue', $shipment->status->value);
        $this->assertNull($shipment->delivered_at);
    }

    public function test_auto_complete_route(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 1);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
        ], $this->auth());

        $routeId = $create->json('id');

        $this->postJson("/api/routes/{$routeId}/start", [], $this->auth());

        $detail = $this->getJson("/api/routes/{$routeId}", $this->auth());
        $stopId = $detail->json('stops.0.id');

        $complete = $this->postJson("/api/routes/{$routeId}/stops/{$stopId}/complete", [], $this->auth());
        $this->assertEquals(100, $complete->json('progress'));
        $this->assertEquals('completed', $complete->json('route_status'));
    }

    public function test_reorder_stops(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 3);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
        ], $this->auth());

        $routeId = $create->json('id');

        $detail = $this->getJson("/api/routes/{$routeId}", $this->auth());
        $stopIds = collect($detail->json('stops'))->pluck('id')->toArray();

        // Revertir el orden
        $reversed = array_reverse($stopIds);

        $reorder = $this->putJson("/api/routes/{$routeId}/reorder", [
            'stop_ids' => $reversed,
        ], $this->auth());

        $reorder->assertOk();
    }

    public function test_add_stop_to_existing_route(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 2);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
        ], $this->auth());

        $routeId = $create->json('id');

        // Agregar otro envío
        $extraShipment = Shipment::find($this->shipmentIdsForDriver($driver, 1)[0]);

        $add = $this->postJson("/api/routes/{$routeId}/add-stop", [
            'shipment_id' => $extraShipment->id,
        ], $this->auth());

        $add->assertOk();
        $this->assertEquals(3, $add->json('total_stops'));
    }
}
