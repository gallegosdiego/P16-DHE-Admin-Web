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
