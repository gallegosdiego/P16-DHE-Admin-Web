<?php

namespace Tests\Feature;

use App\Domain\Driver\Models\Driver;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Shipment\Models\Route;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RouteTaskStopTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Driver $driver;
    private Route $route;

    public function test_closed_hub_rejects_new_returns_and_route_scheduling(): void
    {
        $location = \App\Domain\Operations\Models\ServiceLocation::where('is_active', true)->firstOrFail();
        $shipment = \App\Domain\Shipment\Models\Shipment::firstOrFail();
        $location->update(['is_active' => false]);
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/shipments/{$shipment->id}/returns", [
            'return_type' => 'return_to_hub', 'service_location_id' => $location->id, 'reason_code' => 'TEST',
        ])->assertUnprocessable()->assertJsonValidationErrors('service_location_id');
        $task = OperationalTask::create([
            'task_code' => 'CLOSED-HUB', 'task_type' => 'return_to_hub', 'status' => 'assigned',
            'service_location_id' => $location->id, 'assigned_driver_id' => $this->driver->id,
        ]);
        $this->postJson("/api/routes/{$this->route->id}/task-stops", ['operational_task_id' => $task->id])
            ->assertUnprocessable()->assertJsonValidationErrors('service_location_id');
        $this->assertDatabaseMissing('operational_tasks', ['shipment_id' => $shipment->id, 'task_type' => 'return_to_hub']);
        $this->assertDatabaseMissing('route_task_stops', ['operational_task_id' => $task->id]);
    }

    public function test_driver_receives_current_hub_address_and_cannot_complete_after_it_closes(): void
    {
        $location = \App\Domain\Operations\Models\ServiceLocation::where('is_active', true)->firstOrFail();
        $task = OperationalTask::create([
            'task_code' => 'CURRENT-HUB', 'task_type' => 'return_to_hub', 'status' => 'in_progress',
            'service_location_id' => $location->id, 'assigned_driver_id' => $this->driver->id,
        ]);
        $stop = \App\Domain\Shipment\Models\RouteTaskStop::create([
            'route_id' => $this->route->id, 'operational_task_id' => $task->id, 'sort_order' => 1, 'status' => 'in_progress',
        ]);
        $location->update(['address_line1' => 'Calle 13 #15-48, Locales 91 y 92']);
        $user = User::factory()->create(['driver_id' => $this->driver->id]);
        $user->assignRole(\Spatie\Permission\Models\Role::where('name', 'driver')->where('guard_name', 'web')->firstOrFail());
        $this->actingAs($user, 'sanctum')->getJson('/api/driver/route-tasks')->assertOk()
            ->assertJsonPath('data.0.operational_task.service_location.address_line1', $location->address_line1)
            ->assertJsonPath('data.0.operational_task.service_location.is_active', true);
        $location->update(['is_active' => false]);
        $this->postJson("/api/driver/route-tasks/{$stop->id}/transition", ['status' => 'completed'])
            ->assertUnprocessable()->assertJsonValidationErrors('service_location_id');
        $this->assertDatabaseHas('route_task_stops', ['id' => $stop->id, 'status' => 'in_progress']);
        $this->assertDatabaseHas('operational_tasks', ['id' => $task->id, 'status' => 'in_progress']);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->seed(\Database\Seeders\DemoDataSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();
        $this->driver = Driver::where('status', 'active')->firstOrFail();
        $this->route = Route::create(['driver_id' => $this->driver->id, 'route_date' => now()->toDateString(), 'zone' => 'Pruebas', 'status' => 'planned']);
    }

    public function test_admin_can_add_and_complete_a_non_shipment_task_in_a_route(): void
    {
        $task = OperationalTask::create([
            'service_location_id' => \App\Domain\Operations\Models\ServiceLocation::where('is_active', true)->firstOrFail()->id,
            'task_code' => 'OT-TEST-RETURN', 'task_type' => 'return_to_hub', 'status' => 'assigned',
            'assignee_type' => 'danhei_driver', 'assigned_driver_id' => $this->driver->id, 'assigned_at' => now(),
            'scheduled_date' => now()->toDateString(), 'notes' => 'Devolver paquete a la sede.',
        ]);

        $created = $this->actingAs($this->admin, 'sanctum')->postJson("/api/routes/{$this->route->id}/task-stops", [
            'operational_task_id' => $task->id,
        ])->assertCreated();

        $stopId = $created->json('data.id');
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/routes/{$this->route->id}/task-stops/{$stopId}/transition", ['status' => 'accepted'])->assertOk();
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/routes/{$this->route->id}/task-stops/{$stopId}/transition", ['status' => 'in_progress'])->assertOk();
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/routes/{$this->route->id}/task-stops/{$stopId}/transition", ['status' => 'completed'])->assertOk();

        $this->assertDatabaseHas('route_task_stops', ['id' => $stopId, 'route_id' => $this->route->id, 'status' => 'completed']);
        $this->assertDatabaseHas('operational_tasks', ['id' => $task->id, 'status' => 'completed']);
    }
}
