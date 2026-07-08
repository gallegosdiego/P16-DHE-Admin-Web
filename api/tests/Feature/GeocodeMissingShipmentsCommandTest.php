<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Shared\Models\Zone;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Services\GeocodingService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GeocodeMissingShipmentsCommandTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();
    }

    public function test_command_geocodes_pending_shipments(): void
    {
        $client = Client::create([
            'name' => 'Cliente Command Geo',
            'phone' => '310 000 2000',
            'billing_type' => 'cash_on_delivery',
        ]);

        $this->app->instance(GeocodingService::class, new class extends GeocodingService
        {
            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                return ['lat' => 4.6301, 'lng' => -74.0902];
            }
        });

        $shipment = Shipment::withoutEvents(function () use ($client) {
            return Shipment::create([
                'tracking_code' => 'DHE2026070200010',
                'display_code' => '#DHE70100',
                'sequence_number' => 70100,
                'client_id' => $client->id,
                'created_by' => $this->admin->id,
                'recipient_name' => 'Pendiente geo',
                'recipient_phone' => '3000000010',
                'recipient_address' => 'Cl 30 #30-30',
                'recipient_city' => 'Bogota',
                'recipient_lat' => null,
                'recipient_lng' => null,
                'status' => 'registered',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 10000,
                'financial_status' => 'pending',
            ]);
        });

        $this->artisan('shipments:geocode-missing', [
            '--limit' => 10,
            '--json' => true,
        ])->assertExitCode(0);

        $shipment->refresh();

        $this->assertSame(4.6301, $shipment->recipient_lat);
        $this->assertSame(-74.0902, $shipment->recipient_lng);
        $this->assertNotNull($shipment->geocoded_at);
    }

    public function test_command_dry_run_does_not_persist_coordinates(): void
    {
        $client = Client::create([
            'name' => 'Cliente Command Dry Run',
            'phone' => '310 000 2001',
            'billing_type' => 'cash_on_delivery',
        ]);

        $this->app->instance(GeocodingService::class, new class extends GeocodingService
        {
            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                return ['lat' => 4.6401, 'lng' => -74.0801];
            }
        });

        $shipment = Shipment::withoutEvents(function () use ($client) {
            return Shipment::create([
                'tracking_code' => 'DHE2026070200011',
                'display_code' => '#DHE70101',
                'sequence_number' => 70101,
                'client_id' => $client->id,
                'created_by' => $this->admin->id,
                'recipient_name' => 'Dry run',
                'recipient_phone' => '3000000011',
                'recipient_address' => 'Cl 31 #31-31',
                'recipient_city' => 'Bogota',
                'recipient_lat' => null,
                'recipient_lng' => null,
                'status' => 'registered',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 10000,
                'financial_status' => 'pending',
            ]);
        });

        $this->artisan('shipments:geocode-missing', [
            '--limit' => 10,
            '--dry-run' => true,
            '--json' => true,
        ])->assertExitCode(0);

        $shipment->refresh();

        $this->assertNull($shipment->recipient_lat);
        $this->assertNull($shipment->recipient_lng);
        $this->assertNull($shipment->geocoded_at);
    }

    public function test_command_resolves_city_from_zone_for_legacy_shipments(): void
    {
        Zone::create([
            'name' => 'Chapinero',
            'city' => 'Bogota',
            'type' => 'urban',
            'is_active' => true,
        ]);

        $client = Client::create([
            'name' => 'Cliente Command Legacy Geo',
            'phone' => '310 000 2002',
            'billing_type' => 'cash_on_delivery',
        ]);

        $shipment = Shipment::withoutEvents(function () use ($client) {
            return Shipment::create([
                'tracking_code' => 'DHE2026070200012',
                'display_code' => '#DHE70102',
                'sequence_number' => 70102,
                'client_id' => $client->id,
                'created_by' => $this->admin->id,
                'recipient_name' => 'Legacy sin ciudad',
                'recipient_phone' => '3000000012',
                'recipient_address' => 'Cl 32 #32-32',
                'recipient_zone' => 'Chapinero',
                'recipient_city' => '',
                'recipient_lat' => null,
                'recipient_lng' => null,
                'status' => 'registered',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 10000,
                'financial_status' => 'pending',
            ]);
        });

        $this->app->instance(GeocodingService::class, new class extends GeocodingService
        {
            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                return ['lat' => 4.6402, 'lng' => -74.0612];
            }
        });

        $this->artisan('shipments:geocode-missing', [
            '--limit' => 10,
            '--json' => true,
        ])->assertExitCode(0);

        $shipment->refresh();

        $this->assertSame('Bogota', $shipment->recipient_city);
        $this->assertSame(4.6402, $shipment->recipient_lat);
        $this->assertSame(-74.0612, $shipment->recipient_lng);
        $this->assertNotNull($shipment->geocoded_at);
    }

    public function test_command_applies_known_zone_anchor_when_provider_cannot_geocode(): void
    {
        Zone::create([
            'name' => 'Bosa',
            'city' => 'Bogota',
            'type' => 'urban',
            'is_active' => true,
        ]);

        $client = Client::create([
            'name' => 'Cliente Zone Anchor',
            'phone' => '310 000 2003',
            'billing_type' => 'cash_on_delivery',
        ]);

        $shipment = Shipment::withoutEvents(function () use ($client) {
            return Shipment::create([
                'tracking_code' => 'DHE2026070200013',
                'display_code' => '#DHE70103',
                'sequence_number' => 70103,
                'client_id' => $client->id,
                'created_by' => $this->admin->id,
                'recipient_name' => 'Jonathan',
                'recipient_phone' => '3000000013',
                'recipient_address' => 'Calle 135 # 103F-64',
                'recipient_zone' => 'Bosa',
                'recipient_city' => 'Bogota',
                'recipient_lat' => null,
                'recipient_lng' => null,
                'status' => 'registered',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 10000,
                'financial_status' => 'pending',
            ]);
        });

        $this->app->instance(GeocodingService::class, new class extends GeocodingService
        {
            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                return null;
            }
        });

        $this->artisan('shipments:geocode-missing', [
            '--limit' => 10,
            '--json' => true,
        ])->assertExitCode(0);

        $shipment->refresh();

        $this->assertNotNull($shipment->recipient_lat);
        $this->assertNotNull($shipment->recipient_lng);
        $this->assertGreaterThan(4.55, $shipment->recipient_lat);
        $this->assertLessThan(4.68, $shipment->recipient_lat);
        $this->assertGreaterThan(-74.25, $shipment->recipient_lng);
        $this->assertLessThan(-74.13, $shipment->recipient_lng);
        $this->assertNotNull($shipment->geocoded_at);
    }
}
