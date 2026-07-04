<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shared\Models\Zone;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Services\GeocodingService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
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

    public function test_driver_my_route_repairs_missing_coordinates_for_existing_route_stops(): void
    {
        Zone::create([
            'name' => 'Centro',
            'city' => 'Bogota',
            'type' => 'urban',
            'is_active' => true,
        ]);

        $shipment = $this->route->stops()->with('shipment')->firstOrFail()->shipment;
        $shipment->forceFill([
            'recipient_city' => '',
            'recipient_lat' => null,
            'recipient_lng' => null,
            'geocoded_at' => null,
        ])->saveQuietly();

        $this->app->instance(GeocodingService::class, new class extends GeocodingService
        {
            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                return ['lat' => 4.6115, 'lng' => -74.0724];
            }
        });

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/my-route');

        $response->assertOk()
            ->assertJsonPath('route.stops.0.shipment.recipient_city', 'Bogota')
            ->assertJsonPath('route.stops.0.shipment.recipient_lat', 4.6115)
            ->assertJsonPath('route.stops.0.shipment.recipient_lng', -74.0724);

        $shipment->refresh();

        $this->assertSame('Bogota', $shipment->recipient_city);
        $this->assertSame(4.6115, $shipment->recipient_lat);
        $this->assertSame(-74.0724, $shipment->recipient_lng);
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

    public function test_driver_user_can_sync_live_location_and_receive_it_in_route_payload(): void
    {
        $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/location', [
                'lat' => 4.6111111,
                'lng' => -74.0711111,
                'heading' => 92.5,
                'speed' => 11.4,
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('location.freshness', 'live');

        $this->driver->refresh();
        $this->assertSame(4.6111111, round((float) $this->driver->last_lat, 7));
        $this->assertSame(-74.0711111, round((float) $this->driver->last_lng, 7));

        $routeResponse = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/my-route');

        $routeResponse->assertOk();
        $location = $routeResponse->json('route.driver_location');

        $this->assertNotNull($location);
        $this->assertSame(4.6111111, round((float) $location['lat'], 7));
        $this->assertSame(-74.0711111, round((float) $location['lng'], 7));
        $this->assertSame('live', $location['freshness']);
    }

    public function test_driver_operational_state_unifies_route_and_assigned_shipments(): void
    {
        $assignedShipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHEOPSSTATE1',
            'display_code' => '#DHE92041',
            'sequence_number' => 92041,
            'status' => 'assigned_to_route',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/operational-state');

        $response->assertOk()
            ->assertJsonPath('route.id', $this->route->id)
            ->assertJsonPath('route_day.id', $this->route->id)
            ->assertJsonPath('flags.has_route_day', true)
            ->assertJsonPath('flags.has_navigable_route', true)
            ->assertJsonPath('flags.has_navigable_stops', true)
            ->assertJsonPath('flags.has_assigned_shipments', true)
            ->assertJsonPath('flags.can_create_or_extend_route', true)
            ->assertJsonPath('navigation.current_stop_id', $this->route->stops()->firstOrFail()->id)
            ->assertJsonPath('summary.total_stops', 1)
            ->assertJsonPath('summary.completed_stops', 0)
            ->assertJsonPath('summary.assigned_shipments_count', 1);

        $assignedIds = collect($response->json('assigned_shipments'))->pluck('id')->all();
        $this->assertContains($assignedShipment->id, $assignedIds);
    }

    public function test_driver_operational_state_prefers_persisted_route_metrics(): void
    {
        $this->route->update([
            'optimized_distance_meters' => 12400,
            'optimized_duration_seconds' => 2280,
            'remaining_distance_meters' => 6100,
            'remaining_duration_seconds' => 1140,
            'optimization_source' => 'google_routes',
            'optimized_at' => now(),
            'origin_lat' => 4.6097,
            'origin_lng' => -74.0817,
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/operational-state');

        $response->assertOk()
            ->assertJsonPath('summary.total_distance_km', 12.4)
            ->assertJsonPath('summary.total_duration_min', 38)
            ->assertJsonPath('summary.remaining_distance_km', 6.1)
            ->assertJsonPath('summary.remaining_duration_min', 19)
            ->assertJsonPath('summary.source', 'google_routes')
            ->assertJsonPath('route.route_metrics.total_distance_km', 12.4)
            ->assertJsonPath('route.route_metrics.remaining_distance_km', 6.1);
    }

    public function test_driver_operational_state_exposes_route_geometry_snapshot(): void
    {
        $stop = $this->route->stops()->firstOrFail();

        $this->route->update([
            'optimization_source' => 'local_fallback',
            'overview_polyline' => 'encoded-overview',
            'route_legs' => [[
                'stop_id' => $stop->id,
                'distance_meters' => 1850,
                'duration_seconds' => 420,
                'encoded_polyline' => 'encoded-leg',
            ]],
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/operational-state');

        $response->assertOk()
            ->assertJsonPath('route.route_geometry.source', 'local_fallback')
            ->assertJsonPath('route.route_geometry.overview_polyline', 'encoded-overview')
            ->assertJsonPath('route.route_geometry.legs.0.stop_id', $stop->id)
            ->assertJsonPath('route.route_geometry.legs.0.status', 'pending')
            ->assertJsonPath('route.route_geometry.legs.0.distance_meters', 1850)
            ->assertJsonPath('route.route_geometry.legs.0.duration_min', 7);
    }

    public function test_driver_operational_state_marks_completed_day_as_resumable_when_new_shipments_arrive(): void
    {
        $stop = $this->route->stops()->firstOrFail();
        $stop->update(['status' => 'completed']);
        $stop->shipment->update(['status' => 'delivered']);
        $this->route->update([
            'status' => 'completed',
            'total_stops' => 1,
            'completed_stops' => 1,
        ]);

        $assignedShipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHEOPSSTATE2',
            'display_code' => '#DHE92042',
            'sequence_number' => 92042,
            'status' => 'assigned_to_route',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/operational-state');

        $response->assertOk()
            ->assertJsonPath('route', null)
            ->assertJsonPath('route_day.id', $this->route->id)
            ->assertJsonPath('route_day.status', 'completed')
            ->assertJsonPath('flags.has_route_day', true)
            ->assertJsonPath('flags.has_navigable_route', false)
            ->assertJsonPath('flags.can_resume_completed_day', true)
            ->assertJsonPath('flags.has_assigned_shipments', true)
            ->assertJsonPath('summary.total_stops', 1)
            ->assertJsonPath('summary.completed_stops', 1)
            ->assertJsonPath('summary.assigned_shipments_count', 1);

        $assignedIds = collect($response->json('assigned_shipments'))->pluck('id')->all();
        $this->assertContains($assignedShipment->id, $assignedIds);
    }

    public function test_driver_can_view_history_summary_and_day_detail(): void
    {
        $stop = $this->route->stops()->firstOrFail();
        $stop->update(['status' => 'completed']);
        $stop->shipment->update([
            'status' => 'delivered',
            'delivered_at' => now(),
            'driver_fee' => 3500,
        ]);
        $this->route->update([
            'status' => 'completed',
            'total_stops' => 1,
            'completed_stops' => 1,
        ]);

        $yesterdayShipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHEHISTORY1',
            'display_code' => '#DHE92050',
            'sequence_number' => 92050,
            'status' => 'delivered',
            'payment_type' => 'cash_on_delivery',
            'cod_amount' => 12000,
            'driver_fee' => 4000,
            'delivered_at' => now()->subDay(),
        ]);

        $yesterdayRoute = Route::create([
            'driver_id' => $this->driver->id,
            'route_date' => now()->subDay()->toDateString(),
            'zone' => 'Centro',
            'status' => 'completed',
            'total_stops' => 1,
            'completed_stops' => 1,
        ]);

        RouteStop::create([
            'route_id' => $yesterdayRoute->id,
            'shipment_id' => $yesterdayShipment->id,
            'sort_order' => 1,
            'status' => 'completed',
        ]);

        $history = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/history?per_page=5');

        $history->assertOk()
            ->assertJsonPath('data.0.route_date', now()->toDateString())
            ->assertJsonPath('data.1.route_date', now()->subDay()->toDateString())
            ->assertJsonPath('data.1.total_stops', 1)
            ->assertJsonPath('data.1.completed_stops', 1)
            ->assertJsonPath('data.1.shipment_count', 1)
            ->assertJsonPath('summary.worked_days', 2)
            ->assertJsonPath('summary.completed_stops', 2)
            ->assertJsonPath('summary.shipment_count', 2);

        $detail = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/history/' . now()->subDay()->toDateString());

        $detail->assertOk()
            ->assertJsonPath('route_date', now()->subDay()->toDateString())
            ->assertJsonPath('route_count', 1)
            ->assertJsonPath('shipments.0.id', $yesterdayShipment->id)
            ->assertJsonPath('shipments.0.display_code', '#DHE92050')
            ->assertJsonPath('shipments.0.route_id', $yesterdayRoute->id)
            ->assertJsonPath('shipments.0.stop_status', 'completed');
    }

    public function test_admin_can_view_driver_history_summary_and_day_detail(): void
    {
        $historicalShipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHEADMINHIST1',
            'display_code' => '#DHE92051',
            'sequence_number' => 92051,
            'status' => 'delivered',
            'driver_fee' => 4500,
            'delivered_at' => now()->subDays(2),
        ]);

        $historicalRoute = Route::create([
            'driver_id' => $this->driver->id,
            'route_date' => now()->subDays(2)->toDateString(),
            'zone' => 'Centro',
            'status' => 'completed',
            'total_stops' => 1,
            'completed_stops' => 1,
        ]);

        RouteStop::create([
            'route_id' => $historicalRoute->id,
            'shipment_id' => $historicalShipment->id,
            'sort_order' => 1,
            'status' => 'completed',
        ]);

        $history = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/drivers/{$this->driver->id}/history?per_page=5");

        $history->assertOk()
            ->assertJsonPath('data.0.route_date', now()->toDateString())
            ->assertJsonPath('data.1.route_date', now()->subDays(2)->toDateString())
            ->assertJsonPath('summary.worked_days', 2)
            ->assertJsonPath('summary.completed_stops', 1)
            ->assertJsonPath('summary.shipment_count', 2);

        $detail = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/drivers/' . $this->driver->id . '/history/' . now()->subDays(2)->toDateString());

        $detail->assertOk()
            ->assertJsonPath('route_date', now()->subDays(2)->toDateString())
            ->assertJsonPath('shipments.0.id', $historicalShipment->id)
            ->assertJsonPath('shipments.0.display_code', '#DHE92051');
    }

    public function test_driver_profile_exposes_document_payload(): void
    {
        $this->driver->update([
            'driver_license_photo' => 'https://cdn.example.com/license.jpg',
            'driver_license_expires_at' => now()->addDays(15)->toDateString(),
            'soat_photo' => 'https://cdn.example.com/soat.jpg',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/profile');

        $response->assertOk()
            ->assertJsonPath('id', $this->driver->id)
            ->assertJsonPath('documents.count_present', 2)
            ->assertJsonPath('documents.count_required', 6)
            ->assertJsonPath('documents.count_warning', 2)
            ->assertJsonPath('documents.count_missing', 4)
            ->assertJsonPath('documents.items.0.key', 'driver_license_photo')
            ->assertJsonPath('documents.items.0.present', true)
            ->assertJsonPath('documents.items.0.supports_expiry', true)
            ->assertJsonPath('documents.items.0.expires_at', now()->addDays(15)->toDateString())
            ->assertJsonPath('documents.items.0.alert_level', 'warning')
            ->assertJsonPath('documents.items.2.key', 'soat_photo')
            ->assertJsonPath('documents.items.2.present', true)
            ->assertJsonPath('documents.items.2.alert_level', 'warning')
            ->assertJsonPath('documents.items.5.key', 'national_id_back_photo');
    }

    public function test_admin_can_upload_and_clear_driver_documents(): void
    {
        Storage::fake('public');

        $upload = $this->actingAs($this->adminUser, 'sanctum')->post(
            "/api/drivers/{$this->driver->id}/documents",
            [
                'driver_license_photo' => UploadedFile::fake()->image('license.jpg'),
                'soat_photo' => UploadedFile::fake()->image('soat.jpg'),
                'driver_license_photo_expires_at' => now()->addYear()->toDateString(),
                'soat_photo_expires_at' => now()->addDays(5)->toDateString(),
            ],
            ['Accept' => 'application/json']
        );

        $upload->assertOk()
            ->assertJsonPath('documents.count_present', 2)
            ->assertJsonPath('documents.items.0.present', true)
            ->assertJsonPath('documents.items.0.expires_at', now()->addYear()->toDateString())
            ->assertJsonPath('documents.items.2.present', true)
            ->assertJsonPath('documents.items.2.alert_level', 'warning');

        $this->driver->refresh();

        $licensePath = ltrim(str_replace('/storage/', '', parse_url((string) $this->driver->driver_license_photo, PHP_URL_PATH) ?: ''), '/');
        $soatPath = ltrim(str_replace('/storage/', '', parse_url((string) $this->driver->soat_photo, PHP_URL_PATH) ?: ''), '/');

        Storage::disk('public')->assertExists($licensePath);
        Storage::disk('public')->assertExists($soatPath);

        $clear = $this->actingAs($this->adminUser, 'sanctum')->post(
            "/api/drivers/{$this->driver->id}/documents",
            ['clear_documents' => ['soat_photo']],
            ['Accept' => 'application/json']
        );

        $clear->assertOk()
            ->assertJsonPath('documents.count_present', 1)
            ->assertJsonPath('documents.items.2.present', false)
            ->assertJsonPath('documents.items.2.expires_at', null);

        Storage::disk('public')->assertMissing($soatPath);
    }

    public function test_admin_can_filter_drivers_by_document_status(): void
    {
        $completeDriver = Driver::create([
            'name' => 'Driver Completo',
            'initials' => 'DC',
            'phone' => '3005550000',
            'vehicle' => 'Moto',
            'plate' => 'CCC003',
            'zone' => 'Norte',
            'status' => 'active',
            'daily_rate' => 0,
            'per_package_rate' => 3000,
            'driver_license_photo' => 'https://cdn.example.com/license-ok.jpg',
            'driver_license_expires_at' => now()->addMonths(8)->toDateString(),
            'vehicle_registration_photo' => 'https://cdn.example.com/property-ok.jpg',
            'soat_photo' => 'https://cdn.example.com/soat-ok.jpg',
            'soat_expires_at' => now()->addMonths(7)->toDateString(),
            'technical_inspection_photo' => 'https://cdn.example.com/tecno-ok.jpg',
            'technical_inspection_expires_at' => now()->addMonths(6)->toDateString(),
            'national_id_front_photo' => 'https://cdn.example.com/id-front-ok.jpg',
            'national_id_back_photo' => 'https://cdn.example.com/id-back-ok.jpg',
        ]);

        $expiredDriver = Driver::create([
            'name' => 'Driver Vencido',
            'initials' => 'DV',
            'phone' => '3006660000',
            'vehicle' => 'Moto',
            'plate' => 'DDD004',
            'zone' => 'Sur',
            'status' => 'active',
            'daily_rate' => 0,
            'per_package_rate' => 3000,
            'driver_license_photo' => 'https://cdn.example.com/license-expired.jpg',
            'driver_license_expires_at' => now()->subDays(3)->toDateString(),
            'vehicle_registration_photo' => 'https://cdn.example.com/property-expired.jpg',
            'soat_photo' => 'https://cdn.example.com/soat-expired.jpg',
            'soat_expires_at' => now()->addMonths(4)->toDateString(),
            'technical_inspection_photo' => 'https://cdn.example.com/tecno-expired.jpg',
            'technical_inspection_expires_at' => now()->addMonths(5)->toDateString(),
            'national_id_front_photo' => 'https://cdn.example.com/id-front-expired.jpg',
            'national_id_back_photo' => 'https://cdn.example.com/id-back-expired.jpg',
        ]);

        $criticalResponse = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/drivers?document_status=critical');

        $criticalResponse->assertOk();
        $criticalIds = collect($criticalResponse->json())->pluck('id')->all();
        $this->assertContains($this->driver->id, $criticalIds);
        $this->assertContains($expiredDriver->id, $criticalIds);
        $this->assertNotContains($completeDriver->id, $criticalIds);

        $completeResponse = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/drivers?document_status=complete');

        $completeResponse->assertOk()
            ->assertJsonPath('0.id', $completeDriver->id)
            ->assertJsonPath('0.document_status', 'ok')
            ->assertJsonPath('0.documents.count_missing', 0)
            ->assertJsonPath('0.documents.count_expired', 0);

        $expiredResponse = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/drivers?document_status=expired');

        $expiredResponse->assertOk();
        $expiredIds = collect($expiredResponse->json())->pluck('id')->all();
        $this->assertContains($expiredDriver->id, $expiredIds);
        $this->assertNotContains($completeDriver->id, $expiredIds);
    }

    public function test_driver_can_upload_own_documents_and_expiry_dates(): void
    {
        Storage::fake('public');

        $upload = $this->actingAs($this->driverUser, 'sanctum')->post(
            '/api/driver/documents',
            [
                'technical_inspection_photo' => UploadedFile::fake()->image('tecno.jpg'),
                'technical_inspection_photo_expires_at' => now()->addMonths(6)->toDateString(),
            ],
            ['Accept' => 'application/json']
        );

        $upload->assertOk()
            ->assertJsonPath('documents.count_present', 1)
            ->assertJsonPath('documents.items.3.present', true)
            ->assertJsonPath('documents.items.3.expires_at', now()->addMonths(6)->toDateString())
            ->assertJsonPath('documents.items.3.alert_level', 'ok');

        $this->driver->refresh();
        $this->assertSame(
            now()->addMonths(6)->toDateString(),
            optional($this->driver->technical_inspection_expires_at)->toDateString()
        );
    }

    public function test_driver_operational_state_aggregates_multiple_routes_for_same_day(): void
    {
        $completedStop = $this->route->stops()->firstOrFail();
        $completedStop->update(['status' => 'completed']);
        $completedStop->shipment->update(['status' => 'delivered']);
        $this->route->update([
            'status' => 'completed',
            'total_stops' => 1,
            'completed_stops' => 1,
            'optimized_distance_meters' => 4200,
            'optimized_duration_seconds' => 900,
            'remaining_distance_meters' => 0,
            'remaining_duration_seconds' => 0,
            'optimization_source' => 'local_fallback',
        ]);

        $shipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHEMULTIROUTE1',
            'display_code' => '#DHE92043',
            'sequence_number' => 92043,
            'status' => 'in_transit',
        ]);

        $newRoute = Route::create([
            'driver_id' => $this->driver->id,
            'route_date' => now()->toDateString(),
            'zone' => 'Centro',
            'status' => 'active',
            'total_stops' => 1,
            'completed_stops' => 0,
            'optimized_distance_meters' => 3100,
            'optimized_duration_seconds' => 780,
            'remaining_distance_meters' => 3100,
            'remaining_duration_seconds' => 780,
            'optimization_source' => 'local_fallback',
        ]);

        $pendingStop = RouteStop::create([
            'route_id' => $newRoute->id,
            'shipment_id' => $shipment->id,
            'sort_order' => 1,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/operational-state');

        $response->assertOk()
            ->assertJsonPath('route.id', $newRoute->id)
            ->assertJsonPath('route_day.status', 'active')
            ->assertJsonPath('route_day.total_stops', 2)
            ->assertJsonPath('route_day.completed_stops', 1)
            ->assertJsonPath('route_day.pending_stops', 1)
            ->assertJsonPath('route_day.progress', 50)
            ->assertJsonPath('summary.total_stops', 2)
            ->assertJsonPath('summary.completed_stops', 1)
            ->assertJsonPath('summary.pending_stops', 1)
            ->assertJsonPath('navigation.current_stop_id', $pendingStop->id);
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

    public function test_driver_can_deliver_legacy_route_cod_without_server_error(): void
    {
        $this->driverUser->assignRole(Role::where('name', 'driver')->where('guard_name', 'sanctum')->firstOrFail());

        $shipment = Shipment::create([
            'tracking_code' => 'DHELEGACYCOD1',
            'display_code' => '#DHE93003',
            'sequence_number' => 93003,
            'client_id' => $this->otherClient->id,
            'driver_id' => $this->driver->id,
            'created_by' => $this->adminUser->id,
            'recipient_name' => 'COD Legacy',
            'recipient_phone' => '3110000032',
            'recipient_address' => 'Cl 32 #3-3',
            'recipient_zone' => 'Centro',
            'recipient_city' => 'Bogota',
            'status' => 'assigned_to_route',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => 0,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ]);

        DB::table('shipments')
            ->where('id', $shipment->id)
            ->update([
                'status' => 'route',
                'payment_type' => 'contra_entrega',
                'financial_status' => 'pending_collection',
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
            'payment_type' => 'cash_on_delivery',
            'financial_status' => 'collected',
            'cod_amount' => 10000,
            'cod_collected_amount' => 10000,
            'cod_payment_method' => 'Efectivo',
        ]);
    }

    public function test_driver_can_deliver_legacy_cod_with_evidence_photo_and_human_labels_without_server_error(): void
    {
        Storage::fake('public');
        $this->driverUser->assignRole(Role::where('name', 'driver')->where('guard_name', 'sanctum')->firstOrFail());

        $shipment = Shipment::create([
            'tracking_code' => 'DHELEGACYCODPHOTO1',
            'display_code' => '#DHE93004',
            'sequence_number' => 93004,
            'client_id' => $this->otherClient->id,
            'driver_id' => $this->driver->id,
            'created_by' => $this->adminUser->id,
            'recipient_name' => 'COD Legacy Foto',
            'recipient_phone' => '3110000042',
            'recipient_address' => 'Cl 42 #4-4',
            'recipient_zone' => 'Centro',
            'recipient_city' => 'Bogota',
            'status' => 'assigned_to_route',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => 0,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ]);

        DB::table('shipments')
            ->where('id', $shipment->id)
            ->update([
                'status' => 'En ruta',
                'payment_type' => 'Contra entrega',
                'financial_status' => 'Pendiente',
            ]);

        RouteStop::create([
            'route_id' => $this->route->id,
            'shipment_id' => $shipment->id,
            'sort_order' => 2,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')->post(
            "/api/shipments/{$shipment->id}/status",
            [
                'status' => 'delivered',
                'description' => 'Entregado. Recaudo 10000 por Nequi.',
                'cod_collected_amount' => 10000,
                'cod_payment_method' => 'Nequi',
                'evidence_receiver_name' => 'Carlos',
                'evidence_photo' => UploadedFile::fake()->image('evidence.jpg'),
            ],
            ['Accept' => 'application/json']
        );

        $response->assertOk();

        $shipment->refresh();

        $this->assertSame('delivered', $shipment->status->value);
        $this->assertSame('cash_on_delivery', $shipment->payment_type->value);
        $this->assertSame('collected', $shipment->financial_status->value);
        $this->assertSame(10000, $shipment->cod_amount);
        $this->assertSame(10000, $shipment->cod_collected_amount);
        $this->assertSame('Nequi', $shipment->cod_payment_method);
        $this->assertSame('Carlos', $shipment->evidence_receiver_name);
        $this->assertNotNull($shipment->evidence_photo);
        $this->assertStringContainsString('evidence', (string) $shipment->evidence_photo);
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

    public function test_driver_can_finalize_route_and_return_pending_shipments_to_assigned_pool(): void
    {
        $completedStop = $this->route->stops()->firstOrFail();
        $completedStop->update(['status' => 'completed']);
        $completedStop->shipment->update(['status' => 'delivered']);
        $this->route->update([
            'status' => 'active',
            'total_stops' => 2,
            'completed_stops' => 1,
        ]);
        $this->driver->update(['status' => 'route']);

        $shipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHEFINALIZE1',
            'display_code' => '#DHE92032',
            'sequence_number' => 92032,
            'status' => 'in_transit',
        ]);

        $pendingStop = RouteStop::create([
            'route_id' => $this->route->id,
            'shipment_id' => $shipment->id,
            'sort_order' => 2,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson("/api/routes/{$this->route->id}/finalize");

        $response->assertOk()
            ->assertJsonPath('returned_shipments', 1)
            ->assertJsonPath('preserved_completed_stops', 1)
            ->assertJsonPath('route_deleted', false);

        $this->assertDatabaseMissing('route_stops', [
            'route_id' => $this->route->id,
            'shipment_id' => $shipment->id,
        ]);
        $this->assertDatabaseHas('routes', [
            'id' => $this->route->id,
            'status' => 'completed',
            'total_stops' => 1,
            'completed_stops' => 1,
        ]);
        $this->assertDatabaseHas('shipments', [
            'id' => $shipment->id,
            'status' => 'assigned_to_route',
        ]);
        $this->assertDatabaseHas('route_stops', [
            'id' => $completedStop->id,
            'status' => 'completed',
        ]);
        $this->assertDatabaseHas('shipment_events', [
            'shipment_id' => $shipment->id,
            'from_status' => 'in_transit',
            'to_status' => 'assigned_to_route',
        ]);

        $assigned = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/assigned-shipments');

        $assigned->assertOk();
        $assignedIds = collect($assigned->json('data'))->pluck('id')->all();
        $this->assertContains($shipment->id, $assignedIds);

        $this->assertDatabaseHas('drivers', [
            'id' => $this->driver->id,
            'status' => 'active',
        ]);
    }

    public function test_driver_can_finalize_route_without_completed_stops_and_route_is_deleted(): void
    {
        $shipment = $this->route->stops()->with('shipment')->firstOrFail()->shipment;
        $this->route->update([
            'status' => 'active',
            'total_stops' => 1,
            'completed_stops' => 0,
        ]);
        $this->driver->update(['status' => 'route']);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson("/api/routes/{$this->route->id}/finalize");

        $response->assertOk()
            ->assertJsonPath('returned_shipments', 1)
            ->assertJsonPath('preserved_completed_stops', 0)
            ->assertJsonPath('route_deleted', true);

        $this->assertDatabaseMissing('routes', [
            'id' => $this->route->id,
        ]);
        $this->assertDatabaseMissing('route_stops', [
            'route_id' => $this->route->id,
        ]);
        $this->assertDatabaseHas('shipments', [
            'id' => $shipment->id,
            'status' => 'assigned_to_route',
        ]);
        $this->assertDatabaseHas('shipment_events', [
            'shipment_id' => $shipment->id,
            'to_status' => 'assigned_to_route',
        ]);
        $this->assertDatabaseHas('drivers', [
            'id' => $this->driver->id,
            'status' => 'active',
        ]);

        $operational = $this->actingAs($this->driverUser, 'sanctum')
            ->getJson('/api/driver/operational-state');

        $operational->assertOk()
            ->assertJsonPath('route', null)
            ->assertJsonPath('assigned_shipments.0.id', $shipment->id)
            ->assertJsonPath('flags.has_navigable_route', false)
            ->assertJsonPath('flags.has_assigned_shipments', true)
            ->assertJsonPath('flags.can_create_or_extend_route', true);
    }

    public function test_driver_smart_route_reopens_completed_same_day_route(): void
    {
        $completedStop = $this->route->stops()->firstOrFail();
        $completedStop->update(['status' => 'completed']);
        $completedStop->shipment->update(['status' => 'delivered']);
        $this->route->update([
            'status' => 'completed',
            'total_stops' => 1,
            'completed_stops' => 1,
        ]);

        $shipment = $this->createShipmentForDriver([
            'tracking_code' => 'DHENEWROUTE1',
            'display_code' => '#DHE92044',
            'sequence_number' => 92044,
            'status' => 'registered',
        ]);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/smart-route', [
                'shipment_ids' => [$shipment->id],
            ]);

        $newRouteId = (int) $response->json('route.id');

        $response->assertCreated()
            ->assertJsonPath('route.status', 'active')
            ->assertJsonPath('route.total_stops', 2)
            ->assertJsonPath('route.completed_stops', 1);

        $this->assertSame($this->route->id, $newRouteId);
        $this->assertDatabaseHas('route_stops', [
            'route_id' => $newRouteId,
            'shipment_id' => $shipment->id,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('route_stops', [
            'id' => $completedStop->id,
            'route_id' => $this->route->id,
            'status' => 'completed',
        ]);
        $this->assertDatabaseHas('routes', [
            'id' => $newRouteId,
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
