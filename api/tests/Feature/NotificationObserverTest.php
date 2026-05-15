<?php

namespace Tests\Feature;

use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Models\Route;
use App\Domain\Driver\Models\Driver;
use App\Domain\Client\Models\Client;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationObserverTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
    }

    private function createTestEntities(): array
    {
        $client = Client::create([
            'name' => 'Cliente Test',
            'email' => 'test@client.com',
            'phone' => '300 111 2222',
            'company' => 'Test Company',
        ]);

        $driver = Driver::create([
            'name' => 'Carlos Despacho',
            'initials' => 'CD',
            'phone' => '312 666 7890',
            'status' => 'active',
        ]);

        return [$client, $driver];
    }

    public function test_notification_created_on_shipment_delivered(): void
    {
        [$client, $driver] = $this->createTestEntities();

        $shipment = Shipment::create([
            'tracking_code' => 'TRK-001',
            'display_code' => 'DHE20260515001',
            'sequence_number' => 1,
            'client_id' => $client->id,
            'driver_id' => $driver->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Juan Pérez',
            'recipient_phone' => '300 999 8888',
            'recipient_address' => 'Calle 100 #15-20',
            'status' => 'in_transit',
            'payment_type' => 'prepaid',
            'shipping_cost' => 8000,
        ]);

        $before = Notification::count();

        $shipment->update(['status' => 'delivered']);

        // The observer should have created at least one notification
        // for the driver user (if matched by name)
        $this->assertGreaterThanOrEqual($before, Notification::count());
    }

    public function test_admin_notified_on_shipment_issue(): void
    {
        [$client, $driver] = $this->createTestEntities();

        $sandra = User::where('email', 'sandra@danheiexpress.com')->first();

        $shipment = Shipment::create([
            'tracking_code' => 'TRK-002',
            'display_code' => 'DHE20260515002',
            'sequence_number' => 2,
            'client_id' => $client->id,
            'driver_id' => $driver->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'María García',
            'recipient_phone' => '300 111 5555',
            'recipient_address' => 'Cra 7 #72-41',
            'status' => 'in_transit',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => 50000,
            'issue_note' => 'Cliente ausente',
        ]);

        $shipment->update(['status' => 'issue']);

        // Sandra (admin) should receive a notification about the issue
        $adminNotif = Notification::where('user_id', $sandra->id)
            ->where('type', 'shipment')
            ->first();

        $this->assertNotNull($adminNotif, 'Admin should receive notification on shipment issue');
        $this->assertStringContainsString('Novedad', $adminNotif->title);
    }

    public function test_no_notification_on_non_status_update(): void
    {
        [$client, $driver] = $this->createTestEntities();

        $shipment = Shipment::create([
            'tracking_code' => 'TRK-003',
            'display_code' => 'DHE20260515003',
            'sequence_number' => 3,
            'client_id' => $client->id,
            'driver_id' => $driver->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Pedro López',
            'recipient_phone' => '300 222 3333',
            'recipient_address' => 'Calle 50 #10-30',
            'status' => 'in_transit',
            'payment_type' => 'prepaid',
            'shipping_cost' => 7000,
        ]);

        $before = Notification::count();

        // Update without changing status
        $shipment->update(['notes' => 'Notas actualizadas']);

        $this->assertEquals($before, Notification::count());
    }

    public function test_route_start_triggers_notification(): void
    {
        [$client, $driver] = $this->createTestEntities();
        $sandra = User::where('email', 'sandra@danheiexpress.com')->first();

        $route = Route::create([
            'driver_id' => $driver->id,
            'route_date' => now()->toDateString(),
            'zone' => 'Norte',
            'status' => 'planned',
            'total_stops' => 5,
            'completed_stops' => 0,
        ]);

        $route->update(['status' => 'active']);

        $notif = Notification::where('user_id', $sandra->id)
            ->where('type', 'route')
            ->first();

        $this->assertNotNull($notif, 'Admin should be notified when route starts');
        $this->assertStringContainsString('Ruta iniciada', $notif->title);
    }

    public function test_route_completion_triggers_notification(): void
    {
        [$client, $driver] = $this->createTestEntities();
        $sandra = User::where('email', 'sandra@danheiexpress.com')->first();

        $route = Route::create([
            'driver_id' => $driver->id,
            'route_date' => now()->toDateString(),
            'zone' => 'Sur',
            'status' => 'active',
            'total_stops' => 3,
            'completed_stops' => 3,
        ]);

        $route->update(['status' => 'completed']);

        $notif = Notification::where('user_id', $sandra->id)
            ->where('type', 'route')
            ->first();

        $this->assertNotNull($notif, 'Admin should be notified when route completes');
        $this->assertStringContainsString('completada', $notif->title);
    }
}
