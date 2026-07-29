<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Services\CustodyRecorder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
                'recipient_lat' => 4.6000 + ($i * 0.01),
                'recipient_lng' => -74.0800 - ($i * 0.01),
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

    public function test_show_route_detail_includes_driver_location_snapshot(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 2);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
        ], $this->auth());

        $driver->update([
            'last_lat' => 4.7012345,
            'last_lng' => -74.0523456,
            'last_heading' => 145.2,
            'last_speed' => 9.6,
            'last_location_updated_at' => now(),
        ]);

        $routeId = $create->json('id');

        $this->getJson("/api/routes/{$routeId}", $this->auth())
            ->assertOk()
            ->assertJsonPath('driver_location.lat', 4.7012345)
            ->assertJsonPath('driver_location.lng', -74.0523456)
            ->assertJsonPath('driver_location.freshness', 'live');
    }

    public function test_show_route_detail_marks_recent_driver_location_snapshot(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 2);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
        ], $this->auth());

        $driver->update([
            'last_lat' => 4.7012345,
            'last_lng' => -74.0523456,
            'last_heading' => 145.2,
            'last_speed' => 9.6,
            'last_location_updated_at' => now()->subMinutes(4),
        ]);

        $routeId = $create->json('id');

        $this->getJson("/api/routes/{$routeId}", $this->auth())
            ->assertOk()
            ->assertJsonPath('driver_location.freshness', 'recent');
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

    public function test_start_route_requires_traced_packages_to_be_in_driver_custody(): void
    {
        $driver = Driver::where('status', 'active')->firstOrFail();
        $shipmentId = $this->shipmentIdsForDriver($driver, 1)[0];
        $shipment = Shipment::findOrFail($shipmentId);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => [$shipmentId],
        ], $this->auth())->assertCreated();

        $routeId = $create->json('id');
        $stopId = $this->getJson("/api/routes/{$routeId}", $this->auth())
            ->assertOk()
            ->json('stops.0.id');

        app(CustodyRecorder::class)->record($shipment->refresh(), [
            'event_type' => 'received_at_hub',
            'new_custodian_type' => 'hub',
            'new_custodian_id' => 1,
            'new_custodian_name' => 'Sede principal',
            'actor_user_id' => $this->admin->id,
        ]);

        $this->postJson("/api/routes/{$routeId}/start", [], $this->auth())
            ->assertUnprocessable()
            ->assertJsonPath('code', 'route_custody_pending')
            ->assertJsonPath('pending_shipment_ids.0', $shipmentId);

        $this->assertSame('planned', Route::findOrFail($routeId)->status);

        $this->postJson("/api/routes/{$routeId}/stops/{$stopId}/handover", [
            'scan_code' => $shipment->display_code,
            'notes' => 'Entrega manual de prueba para activar la ruta.',
        ], array_merge($this->auth(), ['Idempotency-Key' => 'start-custody-001']))
            ->assertOk();

        $this->postJson("/api/routes/{$routeId}/start", [], $this->auth())
            ->assertOk()
            ->assertJsonPath('status', 'active');
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

    public function test_complete_stop_is_idempotent_when_already_completed(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 1);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
        ], $this->auth());

        $routeId = $create->json('id');

        $this->postJson("/api/routes/{$routeId}/start", [], $this->auth())->assertOk();

        $detail = $this->getJson("/api/routes/{$routeId}", $this->auth());
        $stopId = $detail->json('stops.0.id');

        $this->postJson("/api/routes/{$routeId}/stops/{$stopId}/complete", [], $this->auth())
            ->assertOk()
            ->assertJsonPath('route_status', 'completed');

        $retry = $this->postJson("/api/routes/{$routeId}/stops/{$stopId}/complete", [], $this->auth());

        $retry->assertOk()
            ->assertJsonPath('message', 'Parada ya completada')
            ->assertJsonPath('route_status', 'completed')
            ->assertJsonPath('progress', 100);
    }

    public function test_optimize_route_persists_total_and_remaining_metrics(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipments = $this->shipmentIdsForDriver($driver, 3);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipments,
            'driver_lat' => 4.6097,
            'driver_lng' => -74.0817,
            'activate' => true,
        ], $this->auth());

        $routeId = $create->json('id');

        $this->postJson("/api/routes/{$routeId}/optimize", [
            'driver_lat' => 4.6097,
            'driver_lng' => -74.0817,
        ], $this->auth())
            ->assertOk()
            ->assertJsonCount(3, 'route.route_geometry.legs');

        $route = Route::findOrFail($routeId);

        $this->assertNotNull($route->optimized_distance_meters);
        $this->assertNotNull($route->optimized_duration_seconds);
        $this->assertNotNull($route->remaining_distance_meters);
        $this->assertNotNull($route->remaining_duration_seconds);
        $this->assertNotNull($route->optimized_at);
        $this->assertNotNull($route->origin_lat);
        $this->assertNotNull($route->origin_lng);
        $this->assertGreaterThan(0, (int) $route->optimized_distance_meters);
        $this->assertIsArray($route->route_legs);
        $this->assertCount(3, $route->route_legs);
        $this->assertContains($route->optimization_source, ['google_routes', 'local_fallback']);
        $this->assertArrayHasKey('stop_id', $route->route_legs[0]);
        $this->assertArrayHasKey('distance_meters', $route->route_legs[0]);
        $this->assertArrayHasKey('duration_seconds', $route->route_legs[0]);
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

    public function test_handover_stop_records_hub_to_driver_custody_and_is_idempotent(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipmentId = $this->shipmentIdsForDriver($driver, 1)[0];
        $shipment = Shipment::findOrFail($shipmentId);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => [$shipment->id],
        ], $this->auth())->assertCreated();

        $routeId = $create->json('id');
        $stopId = $this->getJson("/api/routes/{$routeId}", $this->auth())
            ->assertOk()
            ->json('stops.0.id');

        app(CustodyRecorder::class)->record($shipment->refresh(), [
            'event_type' => 'received_at_hub',
            'new_custodian_type' => 'hub',
            'new_custodian_id' => 1,
            'new_custodian_name' => 'Sede principal',
            'actor_user_id' => $this->admin->id,
        ]);

        $headers = array_merge($this->auth(), ['Idempotency-Key' => 'route-handover-001']);
        $handover = $this->postJson("/api/routes/{$routeId}/stops/{$stopId}/handover", [
            'scan_code' => $shipment->display_code,
            'notes' => 'Entrega manual por falla temporal del lector.',
        ], $headers);

        $handover->assertOk()
            ->assertJsonPath('shipment.display_code', $shipment->display_code)
            ->assertJsonPath('custody.event_type', 'assigned_to_driver')
            ->assertJsonPath('custody.new_custodian_type', 'driver')
            ->assertJsonPath('custody.new_custodian_id', $driver->id);

        $this->assertDatabaseCount('custody_events', 2);

        $this->postJson("/api/routes/{$routeId}/stops/{$stopId}/handover", [
            'scan_code' => $shipment->display_code,
            'notes' => 'Entrega manual por falla temporal del lector.',
        ], $headers)->assertOk();

        $this->assertDatabaseCount('custody_events', 2);
    }

    public function test_handover_stop_rejects_wrong_code_and_missing_hub_custody(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipmentId = $this->shipmentIdsForDriver($driver, 1)[0];
        $shipment = Shipment::findOrFail($shipmentId);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => [$shipment->id],
        ], $this->auth())->assertCreated();

        $routeId = $create->json('id');
        $stopId = $this->getJson("/api/routes/{$routeId}", $this->auth())
            ->assertOk()
            ->json('stops.0.id');

        $this->postJson("/api/routes/{$routeId}/stops/{$stopId}/handover", [
            'scan_code' => '#NO-ES-LA-GUIA',
            'notes' => 'Entrega manual de prueba.',
        ], array_merge($this->auth(), ['Idempotency-Key' => 'route-handover-wrong-code']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('scan_code');

        app(CustodyRecorder::class)->record($shipment->refresh(), [
            'event_type' => 'received_at_hub',
            'new_custodian_type' => 'danhei_employee',
            'new_custodian_id' => $this->admin->id,
            'new_custodian_name' => $this->admin->name,
            'actor_user_id' => $this->admin->id,
        ]);

        $this->postJson("/api/routes/{$routeId}/stops/{$stopId}/handover", [
            'scan_code' => $shipment->display_code,
            'notes' => 'Custodia incorrecta de prueba.',
        ], array_merge($this->auth(), ['Idempotency-Key' => 'route-handover-wrong-custody']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('custody');
    }

    public function test_manifest_exposes_guides_and_custody_counter_without_writing(): void
    {
        $driver = Driver::where('status', 'active')->firstOrFail();
        $shipmentIds = $this->shipmentIdsForDriver($driver, 2);
        $shipments = Shipment::whereIn('id', $shipmentIds)->orderBy('id')->get();

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipmentIds,
        ], $this->auth())->assertCreated();
        $routeId = $create->json('id');
        $routePayload = $this->getJson("/api/routes/{$routeId}", $this->auth())->assertOk()->json();
        $stopId = $routePayload['stops'][0]['id'];

        $recorder = app(CustodyRecorder::class);
        foreach ($shipments as $shipment) {
            $recorder->record($shipment->refresh(), [
                'event_type' => 'received_at_hub',
                'new_custodian_type' => 'hub',
                'new_custodian_id' => 1,
                'new_custodian_name' => 'Sede principal',
                'actor_user_id' => $this->admin->id,
            ]);
        }

        $routeCount = Route::count();
        $custodyCount = DB::table('custody_events')->count();

        $manifest = $this->getJson("/api/routes/{$routeId}/manifest", $this->auth());
        $manifest->assertOk()
            ->assertJsonPath('read_only', true)
            ->assertJsonPath('route.id', $routeId)
            ->assertJsonPath('custody.total', 2)
            ->assertJsonPath('custody.accepted_by_pilot', 0)
            ->assertJsonPath('custody.in_hub', 2)
            ->assertJsonPath('custody.pending', 2)
            ->assertJsonPath('custody.complete', false)
            ->assertJsonPath('items.0.guide.display_code', $shipments[0]->display_code);

        $this->postJson("/api/routes/{$routeId}/stops/{$stopId}/handover", [
            'scan_code' => $shipments[0]->display_code,
            'notes' => 'Entrega manual de prueba para manifiesto.',
        ], array_merge($this->auth(), ['Idempotency-Key' => 'manifest-handover-001']))
            ->assertOk();

        $afterHandover = $this->getJson("/api/routes/{$routeId}/manifest", $this->auth());
        $afterHandover->assertOk()
            ->assertJsonPath('custody.total', 2)
            ->assertJsonPath('custody.accepted_by_pilot', 1)
            ->assertJsonPath('custody.in_hub', 1)
            ->assertJsonPath('custody.pending', 1)
            ->assertJsonPath('custody.complete', false)
            ->assertJsonPath('items.0.custody.scan_confirmed', true);

        $this->assertSame($routeCount, Route::count());
        $this->assertSame($custodyCount + 1, DB::table('custody_events')->count());
    }

    public function test_routable_shipments_include_unassigned_and_stale_route_stops(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipmentIds = $this->shipmentIdsForDriver($driver, 4);

        $unassignedShipment = Shipment::findOrFail($shipmentIds[0]);
        $staleShipment = Shipment::findOrFail($shipmentIds[1]);
        $blockedShipment = Shipment::findOrFail($shipmentIds[2]);
        $activeOldShipment = Shipment::findOrFail($shipmentIds[3]);

        $staleShipment->update([
            'driver_id' => $driver->id,
            'status' => 'assigned_to_route',
        ]);
        $blockedShipment->update([
            'driver_id' => $driver->id,
            'status' => 'assigned_to_route',
        ]);
        $activeOldShipment->update([
            'driver_id' => $driver->id,
            'status' => 'in_transit',
        ]);

        $oldRoute = Route::create([
            'driver_id' => $driver->id,
            'route_date' => now()->subDay()->toDateString(),
            'zone' => $driver->zone,
            'status' => 'completed',
            'total_stops' => 1,
            'completed_stops' => 1,
        ]);
        RouteStop::create([
            'route_id' => $oldRoute->id,
            'shipment_id' => $staleShipment->id,
            'sort_order' => 1,
            'status' => 'completed',
        ]);

        $activeOldRoute = Route::create([
            'driver_id' => $driver->id,
            'route_date' => now()->subDays(2)->toDateString(),
            'zone' => $driver->zone,
            'status' => 'active',
            'total_stops' => 1,
            'completed_stops' => 0,
        ]);
        RouteStop::create([
            'route_id' => $activeOldRoute->id,
            'shipment_id' => $activeOldShipment->id,
            'sort_order' => 1,
            'status' => 'pending',
        ]);

        $currentRoute = Route::create([
            'driver_id' => $driver->id,
            'route_date' => now()->toDateString(),
            'zone' => $driver->zone,
            'status' => 'planned',
            'total_stops' => 1,
            'completed_stops' => 0,
        ]);
        RouteStop::create([
            'route_id' => $currentRoute->id,
            'shipment_id' => $blockedShipment->id,
            'sort_order' => 1,
            'status' => 'pending',
        ]);

        $response = $this->getJson("/api/routes/routable-shipments?driver_id={$driver->id}", $this->auth());

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertContains($unassignedShipment->id, $ids);
        $this->assertContains($staleShipment->id, $ids);
        $this->assertNotContains($blockedShipment->id, $ids);
        $this->assertNotContains($activeOldShipment->id, $ids);
    }

    public function test_dispatch_board_returns_only_hub_custody_grouped_by_zone_and_size(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipmentIds = $this->shipmentIdsForDriver($driver, 3);
        $smallShipment = Shipment::findOrFail($shipmentIds[0]);
        $mediumShipment = Shipment::findOrFail($shipmentIds[1]);
        $withDriverShipment = Shipment::findOrFail($shipmentIds[2]);

        $smallShipment->update([
            'status' => 'in_warehouse',
            'size_code' => 'small',
            'is_fragile' => true,
            'approx_weight_kg' => 1.25,
        ]);
        $mediumShipment->update([
            'status' => 'in_warehouse',
            'size_code' => 'medium',
            'approx_weight_kg' => 4.5,
        ]);
        $withDriverShipment->update([
            'status' => 'in_warehouse',
            'size_code' => 'large',
        ]);

        $recorder = app(CustodyRecorder::class);
        foreach ([$smallShipment, $mediumShipment, $withDriverShipment] as $shipment) {
            $recorder->record($shipment->refresh(), [
                'event_type' => 'received_at_hub',
                'new_custodian_type' => 'hub',
                'new_custodian_id' => 1,
                'new_custodian_name' => 'Sede principal',
                'actor_user_id' => $this->admin->id,
            ]);
        }
        $recorder->record($withDriverShipment->refresh(), [
            'event_type' => 'assigned_to_driver',
            'new_custodian_type' => 'driver',
            'new_custodian_id' => $driver->id,
            'new_custodian_name' => $driver->name,
            'actor_user_id' => $this->admin->id,
        ]);

        $response = $this->getJson('/api/routes/dispatch-board', $this->auth());

        $response->assertOk()
            ->assertJsonPath('summary.total', 2)
            ->assertJsonPath('summary.by_size.small', 1)
            ->assertJsonPath('summary.by_size.medium', 1)
            ->assertJsonPath('summary.fragile', 1)
            ->assertJsonPath('summary.total_weight_kg', 5.75);

        $ids = collect($response->json('shipments'))->pluck('id')->all();
        $this->assertContains($smallShipment->id, $ids);
        $this->assertContains($mediumShipment->id, $ids);
        $this->assertNotContains($withDriverShipment->id, $ids);
        $smallRow = collect($response->json('shipments'))->firstWhere('id', $smallShipment->id);
        $this->assertSame('Pequeño', $smallRow['size_label']);
        $this->assertSame('Sede principal', $smallRow['custody']['new_custodian_name']);

        $filtered = $this->getJson('/api/routes/dispatch-board?size_code=medium', $this->auth())
            ->assertOk();
        $this->assertSame([$mediumShipment->id], collect($filtered->json('shipments'))->pluck('id')->all());
    }

    public function test_dispatch_proposal_preview_balances_selected_pilots_without_writing_routes_or_custody(): void
    {
        $drivers = Driver::where('status', 'active')->orderBy('id')->take(2)->get();
        $this->assertCount(2, $drivers);

        $primaryDriver = $drivers->first();
        $secondaryDriver = $drivers->last();
        $primaryDriver->update([
            'vehicle' => 'Moto',
            'last_lat' => 4.6097,
            'last_lng' => -74.0817,
        ]);
        $secondaryDriver->update([
            'vehicle' => 'Moto',
            'last_lat' => 4.6500,
            'last_lng' => -74.1000,
        ]);

        $shipmentIds = $this->shipmentIdsForDriver($primaryDriver, 4);
        $recorder = app(CustodyRecorder::class);
        foreach ($shipmentIds as $shipmentId) {
            $shipment = Shipment::findOrFail($shipmentId);
            $shipment->update([
                'status' => 'in_warehouse',
                'size_code' => 'small',
            ]);
            $recorder->record($shipment->refresh(), [
                'event_type' => 'received_at_hub',
                'new_custodian_type' => 'hub',
                'new_custodian_id' => 1,
                'new_custodian_name' => 'Sede principal',
                'actor_user_id' => $this->admin->id,
            ]);
        }

        $routeCount = Route::count();
        $custodyCount = DB::table('custody_events')->count();

        $response = $this->postJson('/api/routes/dispatch-proposals/preview', [
            'driver_ids' => $drivers->pluck('id')->all(),
            'shipment_ids' => $shipmentIds,
            'max_packages_per_driver' => 2,
            'origin_lat' => 4.6097,
            'origin_lng' => -74.0817,
        ], $this->auth());

        $response->assertOk()
            ->assertJsonPath('read_only', true)
            ->assertJsonPath('criteria.candidate_count', 4)
            ->assertJsonPath('totals.candidates', 4)
            ->assertJsonPath('totals.assigned', 4)
            ->assertJsonPath('totals.unassigned', 0);

        $proposals = collect($response->json('proposals'));
        $this->assertCount(2, $proposals);
        $this->assertTrue($proposals->every(fn (array $proposal): bool => $proposal['assigned_count'] <= 2));
        $this->assertSame($routeCount, Route::count());
        $this->assertSame($custodyCount, DB::table('custody_events')->count());

        $proposedIds = $proposals
            ->flatMap(fn (array $proposal) => collect($proposal['shipments'])->pluck('id'))
            ->sort()
            ->values()
            ->all();
        sort($shipmentIds);
        $this->assertSame($shipmentIds, $proposedIds);
    }

    public function test_dispatch_proposal_preview_reports_unassigned_when_capacity_is_exhausted(): void
    {
        $driver = Driver::where('status', 'active')->firstOrFail();
        $shipmentIds = $this->shipmentIdsForDriver($driver, 2);
        $recorder = app(CustodyRecorder::class);

        foreach ($shipmentIds as $shipmentId) {
            $shipment = Shipment::findOrFail($shipmentId);
            $shipment->update(['status' => 'in_warehouse', 'size_code' => 'small']);
            $recorder->record($shipment->refresh(), [
                'event_type' => 'received_at_hub',
                'new_custodian_type' => 'hub',
                'new_custodian_id' => 1,
                'new_custodian_name' => 'Sede principal',
                'actor_user_id' => $this->admin->id,
            ]);
        }

        $response = $this->postJson('/api/routes/dispatch-proposals/preview', [
            'driver_ids' => [$driver->id],
            'shipment_ids' => $shipmentIds,
            'max_packages_per_driver' => 1,
        ], $this->auth());

        $response->assertOk()
            ->assertJsonPath('totals.candidates', 2)
            ->assertJsonPath('totals.assigned', 1)
            ->assertJsonPath('totals.unassigned', 1)
            ->assertJsonPath('unassigned.0.reason', 'no_available_capacity');
    }

    public function test_finalize_route_can_reopen_same_day_without_creating_second_route_row(): void
    {
        $driver = Driver::where('status', 'active')->first();
        $shipmentIds = $this->shipmentIdsForDriver($driver, 2);

        $create = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => $shipmentIds,
            'activate' => true,
            'driver_lat' => 4.6097,
            'driver_lng' => -74.0817,
        ], $this->auth())->assertCreated();

        $routeId = $create->json('id');

        $detail = $this->getJson("/api/routes/{$routeId}", $this->auth())->assertOk();
        $stopId = $detail->json('stops.0.id');
        $returnedShipmentId = $detail->json('stops.1.shipment.id');

        $this->postJson("/api/routes/{$routeId}/stops/{$stopId}/complete", [], $this->auth())
            ->assertOk();

        $this->postJson("/api/routes/{$routeId}/finalize", [], $this->auth())
            ->assertOk()
            ->assertJsonPath('closed_route_id', $routeId)
            ->assertJsonPath('preserved_completed_stops', 1)
            ->assertJsonPath('returned_shipments', 1)
            ->assertJsonPath('route_deleted', false);

        $this->assertDatabaseHas('routes', [
            'id' => $routeId,
            'status' => 'completed',
            'total_stops' => 1,
            'completed_stops' => 1,
        ]);

        $returnedShipment = Shipment::findOrFail($returnedShipmentId);
        $this->assertEquals('assigned_to_route', $returnedShipment->status->value);

        $reopen = $this->postJson('/api/routes', [
            'driver_id' => $driver->id,
            'shipment_ids' => [$returnedShipmentId],
            'activate' => true,
            'driver_lat' => 4.611,
            'driver_lng' => -74.082,
        ], $this->auth())->assertCreated();

        $this->assertEquals($routeId, $reopen->json('id'));

        $route = Route::findOrFail($routeId);
        $this->assertEquals('active', $route->status);
        $this->assertEquals(2, $route->total_stops);
        $this->assertEquals(1, $route->completed_stops);
        $this->assertCount(1, Route::where('driver_id', $driver->id)->whereDate('route_date', now()->toDateString())->get());
    }
}
