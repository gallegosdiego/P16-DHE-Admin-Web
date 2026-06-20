<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OperationalIntegrityCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_audit_integrity_repairs_driver_user_id_link(): void
    {
        $user = User::create([
            'name' => 'Piloto Audit',
            'email' => 'piloto.audit@danheiexpress.com',
            'phone' => '3001230000',
            'password' => Hash::make('Audit2026!'),
        ]);
        $user->assignRole('driver');

        $driver = Driver::create([
            'user_id' => $user->id,
            'name' => 'Piloto Audit',
            'initials' => 'PA',
            'phone' => '3001230000',
            'vehicle' => 'Moto',
            'plate' => 'AUD001',
            'zone' => 'Norte',
            'status' => 'active',
            'per_package_rate' => 3000,
        ]);

        $this->assertNull($user->driver_id);

        $this->artisan('operations:audit-integrity', [
            '--fix' => true,
            '--json' => true,
        ])->assertExitCode(0);

        $this->assertSame($driver->id, $user->fresh()->driver_id);
    }

    public function test_audit_integrity_removes_stale_route_stops_and_recounts_route(): void
    {
        $admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();
        $client = Client::firstOrFail();
        $driver = Driver::where('status', 'active')->firstOrFail();

        $shipment = Shipment::create([
            'client_id' => $client->id,
            'driver_id' => $driver->id,
            'created_by' => $admin->id,
            'tracking_code' => 'AUD000000000001',
            'display_code' => '#AUD00001',
            'sequence_number' => (int) (Shipment::withTrashed()->max('sequence_number') ?? 0) + 1,
            'status' => 'assigned_to_route',
            'financial_status' => 'pending',
            'recipient_name' => 'Cliente Audit',
            'recipient_phone' => '3000000000',
            'recipient_address' => 'Calle Audit 123',
            'recipient_zone' => $driver->zone,
            'recipient_city' => 'Bogota',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => 0,
            'driver_fee' => 3000,
        ]);

        $route = Route::create([
            'driver_id' => $driver->id,
            'route_date' => now()->subDay()->toDateString(),
            'zone' => $driver->zone,
            'status' => 'completed',
            'total_stops' => 9,
            'completed_stops' => 9,
        ]);

        $stop = RouteStop::create([
            'route_id' => $route->id,
            'shipment_id' => $shipment->id,
            'sort_order' => 1,
            'status' => 'completed',
        ]);

        $this->artisan('operations:audit-integrity', [
            '--fix' => true,
            '--json' => true,
        ])->assertExitCode(0);

        $this->assertDatabaseMissing('route_stops', ['id' => $stop->id]);
        $this->assertSame(0, $route->fresh()->total_stops);
        $this->assertSame(0, $route->fresh()->completed_stops);
    }
}
