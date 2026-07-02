<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
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

        $shipment = Shipment::create([
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

        $this->app->instance(GeocodingService::class, new class extends GeocodingService
        {
            public function geocode(string $address, string $city): ?array
            {
                return ['lat' => 4.6301, 'lng' => -74.0902];
            }
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

        $shipment = Shipment::create([
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

        $this->app->instance(GeocodingService::class, new class extends GeocodingService
        {
            public function geocode(string $address, string $city): ?array
            {
                return ['lat' => 4.6401, 'lng' => -74.0801];
            }
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
}
