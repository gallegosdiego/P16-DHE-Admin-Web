<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ScopedEndpointTest extends TestCase
{
    use RefreshDatabase;

    private User $adminUser;
    private User $clientUser;
    private User $driverUser;
    private Client $client;
    private Client $otherClient;
    private Driver $driver;
    private Route $route;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->adminUser = User::where('email', 'admin@danheiexpress.com')->firstOrFail();

        $this->client = Client::create([
            'name' => 'Cliente Scope',
            'phone' => '3001110000',
            'billing_type' => 'post_sale',
        ]);

        $this->otherClient = Client::create([
            'name' => 'Cliente Externo',
            'phone' => '3002220000',
            'billing_type' => 'cash_on_delivery',
        ]);

        $this->clientUser = User::create([
            'name' => 'Usuario Client',
            'email' => 'client.scope@danheiexpress.com',
            'password' => Hash::make('secret123'),
            'client_id' => $this->client->id,
        ]);
        $this->clientUser->assignRole('client');

        $this->driver = Driver::create([
            'name' => 'Driver Scope',
            'initials' => 'DS',
            'phone' => '3003330000',
            'vehicle' => 'Moto',
            'plate' => 'AAA001',
            'zone' => 'Centro',
            'status' => 'active',
            'daily_rate' => 0,
            'per_package_rate' => 3000,
        ]);

        $this->driverUser = User::create([
            'name' => 'Usuario Driver',
            'email' => 'driver.scope@danheiexpress.com',
            'password' => Hash::make('secret123'),
            'driver_id' => $this->driver->id,
        ]);
        $this->driverUser->assignRole('driver');

        $ownShipment = Shipment::create([
            'tracking_code' => 'DHESCOPE0001',
            'display_code' => '#DHE91001',
            'sequence_number' => 91001,
            'client_id' => $this->client->id,
            'driver_id' => $this->driver->id,
            'created_by' => $this->adminUser->id,
            'recipient_name' => 'Ana Scope',
            'recipient_phone' => '3110000001',
            'recipient_address' => 'Cl 1 #1-1',
            'recipient_zone' => 'Centro',
            'recipient_city' => 'Bogota',
            'status' => 'in_transit',
            'payment_type' => 'post_sale',
            'shipping_cost' => 15000,
            'cod_amount' => 0,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ]);

        Shipment::create([
            'tracking_code' => 'DHESCOPE0002',
            'display_code' => '#DHE91002',
            'sequence_number' => 91002,
            'client_id' => $this->otherClient->id,
            'driver_id' => null,
            'created_by' => $this->adminUser->id,
            'recipient_name' => 'Pedro Externo',
            'recipient_phone' => '3110000002',
            'recipient_address' => 'Cl 2 #2-2',
            'recipient_zone' => 'Norte',
            'recipient_city' => 'Bogota',
            'status' => 'confirmed',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 12000,
            'cod_amount' => 30000,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ]);

        $this->route = Route::create([
            'driver_id' => $this->driver->id,
            'route_date' => now()->toDateString(),
            'zone' => 'Centro',
            'status' => 'planned',
            'total_stops' => 1,
            'completed_stops' => 0,
        ]);

        RouteStop::create([
            'route_id' => $this->route->id,
            'shipment_id' => $ownShipment->id,
            'sort_order' => 1,
            'status' => 'pending',
        ]);
    }

    public function test_client_user_can_access_my_dashboard(): void
    {
        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson('/api/client/my-dashboard');

        $response->assertOk()
            ->assertJsonPath('client.id', $this->client->id)
            ->assertJsonPath('active_shipments', 1);
    }

    public function test_client_user_only_sees_own_data(): void
    {
        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson('/api/client/my-dashboard');

        $response->assertOk()
            ->assertJsonPath('pending_balance', 15000);

        $recentClientIds = collect($response->json('recent_shipments'))->pluck('client_id')->unique()->values()->all();
        $this->assertSame([$this->client->id], $recentClientIds);
    }

    public function test_admin_can_still_access_everything(): void
    {
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/client/my-dashboard');

        $response->assertOk()
            ->assertJsonPath('client', null)
            ->assertJsonPath('active_shipments', 2);
    }

    public function test_driver_user_can_access_my_route(): void
    {
        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/my-route');

        $response->assertOk()
            ->assertJsonPath('route.id', $this->route->id)
            ->assertJsonPath('route.driver_id', $this->driver->id)
            ->assertJsonPath('route.stops.0.sort_order', 1);
    }

    public function test_driver_my_route_returns_active_route_from_previous_day(): void
    {
        $shipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHEACTIVEOLD1',
            'display_code' => '#DHE92021',
            'sequence_number' => 92021,
            'status' => 'in_transit',
        ]);

        $oldActiveRoute = Route::create([
            'driver_id' => $this->driver->id,
            'route_date' => now()->subDay()->toDateString(),
            'zone' => 'Centro',
            'status' => 'active',
            'total_stops' => 1,
            'completed_stops' => 0,
        ]);

        RouteStop::create([
            'route_id' => $oldActiveRoute->id,
            'shipment_id' => $shipment->id,
            'sort_order' => 1,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/my-route');

        $response->assertOk()
            ->assertJsonPath('route.id', $oldActiveRoute->id)
            ->assertJsonPath('route.status', 'active')
            ->assertJsonPath('route.stops.0.shipment.display_code', '#DHE92021');
    }

    public function test_driver_my_route_survives_missing_cod_collection_columns(): void
    {
        foreach (['cod_collected_amount', 'cod_payment_method', 'cod_collected_at'] as $column) {
            if (Schema::hasColumn('shipments', $column)) {
                Schema::table('shipments', fn ($table) => $table->dropColumn($column));
            }
        }

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/my-route');

        $response->assertOk()
            ->assertJsonPath('route.id', $this->route->id)
            ->assertJsonPath('route.stops.0.shipment.display_code', '#DHE91001');
    }

    public function test_driver_mobile_endpoints_survive_missing_optional_app_columns(): void
    {
        foreach (['intake_photo', 'recipient_lat', 'recipient_lng'] as $column) {
            if (Schema::hasColumn('shipments', $column)) {
                Schema::table('shipments', fn ($table) => $table->dropColumn($column));
            }
        }

        $assignedShipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHEOPTIONALAPP1',
            'display_code' => '#DHE92031',
            'sequence_number' => 92031,
            'status' => 'registered',
        ]);

        $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/my-route')
            ->assertOk()
            ->assertJsonPath('route.id', $this->route->id)
            ->assertJsonPath('route.stops.0.shipment.display_code', '#DHE91001')
            ->assertJsonPath('route.stops.0.shipment.intake_photo', null)
            ->assertJsonPath('route.stops.0.shipment.recipient_lat', null)
            ->assertJsonPath('route.stops.0.shipment.recipient_lng', null);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/assigned-shipments');

        $response->assertOk();

        $row = collect($response->json('data'))->firstWhere('id', $assignedShipment->id);
        $this->assertSame('#DHE92031', $row['display_code'] ?? null);
        $this->assertArrayHasKey('intake_photo', $row);
        $this->assertArrayHasKey('recipient_lat', $row);
        $this->assertArrayHasKey('recipient_lng', $row);
        $this->assertNull($row['intake_photo']);
        $this->assertNull($row['recipient_lat']);
        $this->assertNull($row['recipient_lng']);
    }

    public function test_driver_my_route_survives_legacy_invalid_financial_status(): void
    {
        $shipmentId = $this->route->stops()->firstOrFail()->shipment_id;
        DB::table('shipments')
            ->where('id', $shipmentId)
            ->update(['financial_status' => 'pending_collection']);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/my-route');

        $response->assertOk()
            ->assertJsonPath('route.id', $this->route->id)
            ->assertJsonPath('route.stops.0.shipment.display_code', '#DHE91001');
    }

    public function test_driver_my_route_survives_legacy_invalid_shipment_enums(): void
    {
        $shipmentId = $this->route->stops()->firstOrFail()->shipment_id;
        DB::table('shipments')
            ->where('id', $shipmentId)
            ->update([
                'status' => 'route',
                'payment_type' => 'contra_entrega',
            ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/my-route');

        $response->assertOk()
            ->assertJsonPath('route.id', $this->route->id)
            ->assertJsonPath('route.stops.0.shipment.status', 'route')
            ->assertJsonPath('route.stops.0.shipment.payment_type', 'contra_entrega');
    }

    public function test_driver_user_can_deliver_cod_with_collected_amount(): void
    {
        $this->driverUser->assignRole(Role::where('name', 'driver')->where('guard_name', 'sanctum')->firstOrFail());

        $shipment = Shipment::create([
            'tracking_code' => 'DHECODCOLLECT1',
            'display_code' => '#DHE93001',
            'sequence_number' => 93001,
            'client_id' => $this->otherClient->id,
            'driver_id' => $this->driver->id,
            'created_by' => $this->adminUser->id,
            'recipient_name' => 'COD Scope',
            'recipient_phone' => '3110000030',
            'recipient_address' => 'Cl 30 #3-3',
            'recipient_zone' => 'Centro',
            'recipient_city' => 'Bogota',
            'status' => 'in_transit',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 12000,
            'cod_amount' => 0,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/status", [
                'status' => 'delivered',
                'description' => 'Entregado. Recaudo 25000 por Efectivo.',
                'cod_collected_amount' => 25000,
                'cod_payment_method' => 'Efectivo',
            ]);

        $response->assertOk();

        $this->assertDatabaseHas('shipments', [
            'id' => $shipment->id,
            'status' => 'delivered',
            'financial_status' => 'collected',
            'cod_amount' => 25000,
            'cod_collected_amount' => 25000,
            'cod_payment_method' => 'Efectivo',
        ]);
    }

    public function test_driver_can_deliver_assigned_route_cod_without_server_error(): void
    {
        $this->driverUser->assignRole(Role::where('name', 'driver')->where('guard_name', 'sanctum')->firstOrFail());

        $shipment = Shipment::create([
            'tracking_code' => 'DHECODASSIGNED1',
            'display_code' => '#DHE93002',
            'sequence_number' => 93002,
            'client_id' => $this->otherClient->id,
            'driver_id' => $this->driver->id,
            'created_by' => $this->adminUser->id,
            'recipient_name' => 'COD Asignado',
            'recipient_phone' => '3110000031',
            'recipient_address' => 'Cl 31 #3-3',
            'recipient_zone' => 'Centro',
            'recipient_city' => 'Bogota',
            'status' => 'assigned_to_route',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => 0,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ]);

        RouteStop::create([
            'route_id' => $this->route->id,
            'shipment_id' => $shipment->id,
            'sort_order' => 2,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/status", [
                'status' => 'delivered',
                'description' => 'Entregado. Recaudo 10000 por Efectivo.',
                'cod_collected_amount' => 10000,
                'cod_payment_method' => 'Efectivo',
            ]);

        $response->assertOk();

        $this->assertDatabaseHas('shipments', [
            'id' => $shipment->id,
            'status' => 'delivered',
            'financial_status' => 'collected',
            'cod_amount' => 10000,
            'cod_collected_amount' => 10000,
            'cod_payment_method' => 'Efectivo',
        ]);
        $this->assertDatabaseHas('shipment_events', [
            'shipment_id' => $shipment->id,
            'from_status' => 'assigned_to_route',
            'to_status' => 'in_transit',
        ]);
        $this->assertDatabaseHas('shipment_events', [
            'shipment_id' => $shipment->id,
            'from_status' => 'in_transit',
            'to_status' => 'delivered',
        ]);
    }

    public function test_driver_assigned_shipments_excludes_package_already_in_current_open_route(): void
    {
        $activeRouteShipmentId = $this->route->stops()->firstOrFail()->shipment_id;

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/assigned-shipments');

        $response->assertOk();

        $shipmentIds = collect($response->json('data'))->pluck('id')->all();
        $this->assertNotContains($activeRouteShipmentId, $shipmentIds);
    }

    public function test_driver_assigned_shipments_includes_package_with_stale_route_stop(): void
    {
        $shipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHESTALEROUTE1',
            'display_code' => '#DHE92001',
            'sequence_number' => 92001,
            'status' => 'registered',
        ]);

        $oldRoute = Route::create([
            'driver_id' => $this->driver->id,
            'route_date' => now()->subDay()->toDateString(),
            'zone' => 'Centro',
            'status' => 'planned',
            'total_stops' => 1,
            'completed_stops' => 0,
        ]);

        RouteStop::create([
            'route_id' => $oldRoute->id,
            'shipment_id' => $shipment->id,
            'sort_order' => 1,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/assigned-shipments');

        $response->assertOk();

        $shipmentIds = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($shipment->id, $shipmentIds);
    }

    public function test_driver_assigned_shipments_excludes_package_in_active_previous_day_route(): void
    {
        $shipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHEACTIVEOLD2',
            'display_code' => '#DHE92022',
            'sequence_number' => 92022,
            'status' => 'in_transit',
        ]);

        $oldActiveRoute = Route::create([
            'driver_id' => $this->driver->id,
            'route_date' => now()->subDay()->toDateString(),
            'zone' => 'Centro',
            'status' => 'active',
            'total_stops' => 1,
            'completed_stops' => 0,
        ]);

        RouteStop::create([
            'route_id' => $oldActiveRoute->id,
            'shipment_id' => $shipment->id,
            'sort_order' => 1,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/assigned-shipments');

        $response->assertOk();

        $shipmentIds = collect($response->json('data'))->pluck('id')->all();
        $this->assertNotContains($shipment->id, $shipmentIds);
    }

    public function test_driver_assigned_shipments_survives_legacy_invalid_shipment_enums(): void
    {
        $shipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHELEGACYASSIGNED1',
            'display_code' => '#DHE92011',
            'sequence_number' => 92011,
            'status' => 'registered',
        ]);

        DB::table('shipments')
            ->where('id', $shipment->id)
            ->update([
                'status' => 'route',
                'payment_type' => 'contra_entrega',
                'financial_status' => 'pending_collection',
            ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/assigned-shipments');

        $response->assertOk();

        $row = collect($response->json('data'))->firstWhere('id', $shipment->id);
        $this->assertSame('route', $row['status'] ?? null);
        $this->assertSame('contra_entrega', $row['payment_type'] ?? null);
        $this->assertSame('pending_collection', $row['financial_status'] ?? null);
    }

    public function test_driver_route_optimize_returns_safe_payload_with_legacy_invalid_shipment_enums(): void
    {
        $this->driverUser->assignRole(Role::where('name', 'driver')->where('guard_name', 'sanctum')->firstOrFail());

        $shipmentId = $this->route->stops()->firstOrFail()->shipment_id;
        DB::table('shipments')
            ->where('id', $shipmentId)
            ->update([
                'status' => 'route',
                'payment_type' => 'contra_entrega',
                'financial_status' => 'pending_collection',
                'recipient_lat' => 4.6097,
                'recipient_lng' => -74.0817,
            ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson("/api/routes/{$this->route->id}/optimize", [
                'driver_lat' => 4.6097,
                'driver_lng' => -74.0817,
            ]);

        $response->assertOk()
            ->assertJsonPath('route.id', $this->route->id)
            ->assertJsonPath('route.stops.0.shipment.payment_type', 'contra_entrega')
            ->assertJsonPath('route.stops.0.shipment.financial_status', 'pending_collection');
    }

    public function test_driver_can_remove_stop_with_post_delete_fallback(): void
    {
        $this->driverUser->assignRole(Role::where('name', 'driver')->where('guard_name', 'sanctum')->firstOrFail());

        $stop = $this->route->stops()->firstOrFail();

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson("/api/routes/{$this->route->id}/stops/{$stop->id}/delete");

        $response->assertOk()
            ->assertJsonPath('route.id', $this->route->id)
            ->assertJsonPath('route.total_stops', 0);

        $this->assertDatabaseMissing('route_stops', ['id' => $stop->id]);
    }

    public function test_driver_smart_route_recovers_package_with_stale_route_stop(): void
    {
        $shipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHESTALEROUTE2',
            'display_code' => '#DHE92002',
            'sequence_number' => 92002,
            'status' => 'registered',
        ]);

        $oldRoute = Route::create([
            'driver_id' => $this->driver->id,
            'route_date' => now()->subDay()->toDateString(),
            'zone' => 'Centro',
            'status' => 'planned',
            'total_stops' => 1,
            'completed_stops' => 0,
        ]);

        $staleStop = RouteStop::create([
            'route_id' => $oldRoute->id,
            'shipment_id' => $shipment->id,
            'sort_order' => 1,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/smart-route', [
                'shipment_ids' => [$shipment->id],
            ]);

        $response->assertCreated()
            ->assertJsonPath('route.driver_id', $this->driver->id)
            ->assertJsonPath('route.status', 'active');

        $this->assertDatabaseMissing('route_stops', ['id' => $staleStop->id]);
        $this->assertDatabaseHas('route_stops', [
            'route_id' => $this->route->id,
            'shipment_id' => $shipment->id,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('routes', [
            'id' => $oldRoute->id,
            'total_stops' => 0,
            'completed_stops' => 0,
        ]);
        $this->assertDatabaseHas('shipments', [
            'id' => $shipment->id,
            'status' => 'in_transit',
        ]);
    }

    public function test_driver_smart_route_reopens_completed_route_for_same_day_new_package(): void
    {
        $completedStop = $this->route->stops()->firstOrFail();
        $completedStop->update(['status' => 'completed']);
        $this->route->update([
            'status' => 'completed',
            'total_stops' => 1,
            'completed_stops' => 1,
        ]);

        $shipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHEREOPENROUTE1',
            'display_code' => '#DHE92032',
            'sequence_number' => 92032,
            'status' => 'registered',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/smart-route', [
                'shipment_ids' => [$shipment->id],
            ]);

        $response->assertCreated()
            ->assertJsonPath('route.id', $this->route->id)
            ->assertJsonPath('route.status', 'active')
            ->assertJsonPath('route.total_stops', 2)
            ->assertJsonPath('route.completed_stops', 1);

        $this->assertDatabaseHas('route_stops', [
            'route_id' => $this->route->id,
            'shipment_id' => $shipment->id,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('routes', [
            'id' => $this->route->id,
            'status' => 'active',
            'total_stops' => 2,
            'completed_stops' => 1,
        ]);
        $this->assertDatabaseHas('shipments', [
            'id' => $shipment->id,
            'status' => 'in_transit',
        ]);
    }

    public function test_client_user_cannot_access_operational_routes(): void
    {
        $this->actingAs($this->clientUser, 'sanctum')
            ->getJson('/api/routes')
            ->assertForbidden();

        $this->actingAs($this->clientUser, 'sanctum')
            ->getJson('/api/routes/routable-shipments')
            ->assertForbidden();
    }

    public function test_driver_user_cannot_access_another_driver_route(): void
    {
        $otherDriver = Driver::create([
            'name' => 'Otro Driver',
            'initials' => 'OD',
            'phone' => '3004440000',
            'vehicle' => 'Moto',
            'plate' => 'BBB002',
            'zone' => 'Norte',
            'status' => 'active',
            'daily_rate' => 0,
            'per_package_rate' => 3000,
        ]);

        $otherRoute = Route::create([
            'driver_id' => $otherDriver->id,
            'route_date' => now()->toDateString(),
            'zone' => 'Norte',
            'status' => 'planned',
            'total_stops' => 0,
            'completed_stops' => 0,
        ]);

        $this->actingAs($this->driverUser, 'sanctum')
            ->getJson("/api/routes/{$otherRoute->id}")
            ->assertForbidden();
    }

    public function test_unauthenticated_user_gets_401(): void
    {
        $this->getJson('/api/client/my-dashboard')->assertUnauthorized();
        $this->getJson('/api/driver/my-route')->assertUnauthorized();
    }

    private function createShipmentForDriver(array $overrides = []): Shipment
    {
        $sequence = ((int) Shipment::max('sequence_number')) + 1;

        return Shipment::create(array_merge([
            'tracking_code' => "DHESCOPE{$sequence}",
            'display_code' => "#DHE{$sequence}",
            'sequence_number' => $sequence,
            'client_id' => $this->client->id,
            'driver_id' => $this->driver->id,
            'created_by' => $this->adminUser->id,
            'recipient_name' => 'Paquete Piloto',
            'recipient_phone' => '3110000099',
            'recipient_address' => 'Cl 99 #9-9',
            'recipient_zone' => 'Centro',
            'recipient_city' => 'Bogota',
            'status' => 'registered',
            'payment_type' => 'post_sale',
            'shipping_cost' => 15000,
            'cod_amount' => 0,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ], $overrides));
    }
}
