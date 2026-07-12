<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Operations\Enums\IntakeMode;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Pickup\Services\CollectorHandoverService;
use App\Domain\Pickup\Services\PickupReceptionService;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class DriverPickupWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_assigned_driver_reconciles_the_physical_pickup_and_creates_custody(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();
        $driverUser = User::factory()->create(['email' => 'piloto@danhei.test']);
        $driver = Driver::query()->create([
            'user_id' => $driverUser->id,
            'name' => 'Piloto Ángel',
            'phone' => '3000000000',
        ]);
        $driverUser->update(['driver_id' => $driver->id]);
        $driverUser->syncRoles([
            Role::query()->where('name', 'driver')->where('guard_name', 'web')->firstOrFail(),
            Role::query()->where('name', 'driver')->where('guard_name', 'sanctum')->firstOrFail(),
        ]);

        [$pickup, $package, $task] = $this->materializedPickup($admin);

        Sanctum::actingAs($admin);
        $this->postJson("/api/operational-tasks/{$task->id}/assign", [
            'assignee_type' => 'danhei_driver',
            'assigned_driver_id' => $driver->id,
            'scheduled_date' => now()->toDateString(),
        ])->assertOk()->assertJsonPath('data.status', 'assigned');

        Sanctum::actingAs($driverUser);
        $this->getJson('/api/driver/pickup-tasks')
            ->assertOk()
            ->assertJsonPath('data.0.id', $task->id)
            ->assertJsonPath('data.0.pickup_request.pickup_code', $pickup->pickup_code);

        $this->postJson("/api/driver/pickup-tasks/{$task->id}/transition", ['status' => 'accepted'])
            ->assertOk()->assertJsonPath('data.status', 'accepted');
        $this->postJson("/api/driver/pickup-tasks/{$task->id}/transition", ['status' => 'in_progress'])
            ->assertOk()->assertJsonPath('data.status', 'in_progress');

        $batch = $this->postJson("/api/driver/pickup-tasks/{$task->id}/batch", [
            'lat' => 4.6500,
            'lng' => -74.0500,
        ])->assertCreated()->assertJsonPath('data.expected_packages', 1);

        $batchId = $batch->json('data.id');
        $this->postJson("/api/driver/pickup-batches/{$batchId}/reconcile", [
            'items' => [[
                'pickup_package_id' => $package->id,
                'result' => 'received',
            ]],
        ])->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.received_packages', 1);

        $this->assertDatabaseHas('operational_tasks', ['id' => $task->id, 'status' => 'completed']);
        $this->assertDatabaseHas('pickup_requests', ['id' => $pickup->id, 'status' => 'picked_up']);
        $this->assertDatabaseHas('custody_events', [
            'shipment_id' => $package->shipment_id,
            'event_type' => 'picked_up_from_client',
            'new_custodian_type' => 'driver',
            'new_custodian_id' => $driver->id,
        ]);
    }

    public function test_pickup_with_missing_package_closes_with_differences(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();
        $driverUser = User::factory()->create(['email' => 'piloto2@danhei.test']);
        $driver = Driver::query()->create(['user_id' => $driverUser->id, 'name' => 'Piloto Dos', 'phone' => '3110000000']);
        $driverUser->update(['driver_id' => $driver->id]);
        $driverUser->assignRole('driver');
        [$pickup, $package, $task] = $this->materializedPickup($admin);
        $task->update(['assignee_type' => 'danhei_driver', 'assigned_driver_id' => $driver->id]);
        $service = app(OperationalTaskService::class);
        $task = $service->transition($task, OperationalTaskStatus::ASSIGNED);
        $task = $service->transition($task, OperationalTaskStatus::ACCEPTED);
        $service->transition($task, OperationalTaskStatus::IN_PROGRESS);

        Sanctum::actingAs($driverUser);
        $batchId = $this->postJson("/api/driver/pickup-tasks/{$task->id}/batch")
            ->assertCreated()->json('data.id');
        $this->postJson("/api/driver/pickup-batches/{$batchId}/reconcile", [
            'items' => [[
                'pickup_package_id' => $package->id,
                'result' => 'missing',
                'exception_code' => 'CLIENT_DID_NOT_HAND_OVER',
            ]],
        ])->assertOk()->assertJsonPath('data.status', 'completed_with_differences');

        $this->assertDatabaseHas('pickup_requests', ['id' => $pickup->id, 'status' => 'not_picked_up']);
        $this->assertDatabaseHas('operational_tasks', ['id' => $task->id, 'status' => 'failed']);
        $this->assertDatabaseCount('custody_events', 0);
    }

    public function test_hub_operator_can_receive_a_walk_in_without_a_driver_route(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();
        [$pickup, $package, $task] = $this->materializedPickup($admin, IntakeMode::WALK_IN_AT_HUB);

        Sanctum::actingAs($admin);
        $this->postJson("/api/operational-tasks/{$task->id}/assign", [
            'assignee_type' => 'hub_operator',
            'assigned_executor_name' => 'Operación Sede Central',
        ])->assertOk()->assertJsonPath('data.status', 'assigned');
        $this->postJson("/api/operational-tasks/{$task->id}/transition", ['status' => 'accepted'])->assertOk();
        $this->postJson("/api/operational-tasks/{$task->id}/transition", ['status' => 'in_progress'])->assertOk();
        $batchId = $this->postJson("/api/operational-tasks/{$task->id}/batch")
            ->assertCreated()->json('data.id');
        $this->postJson("/api/operational-pickup-batches/{$batchId}/reconcile", [
            'items' => [[
                'pickup_package_id' => $package->id,
                'result' => 'received',
            ]],
        ])->assertOk()->assertJsonPath('data.status', 'completed');

        $this->assertDatabaseHas('custody_events', [
            'shipment_id' => $package->shipment_id,
            'new_custodian_type' => 'hub',
        ]);
        $this->assertDatabaseCount('routes', 0);
    }

    public function test_authorized_collector_handover_preserves_custody_until_the_hub(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();
        [$pickup, $package, $task] = $this->materializedPickup($admin);
        $task->update([
            'assignee_type' => 'authorized_collector',
            'assigned_executor_name' => 'Recolector externo Ana',
        ]);
        $tasks = app(OperationalTaskService::class);
        $task = $tasks->transition($task, OperationalTaskStatus::ASSIGNED);
        $task = $tasks->transition($task, OperationalTaskStatus::ACCEPTED);
        $task = $tasks->transition($task, OperationalTaskStatus::IN_PROGRESS);
        $reception = app(PickupReceptionService::class);
        $batch = $reception->start($task, $admin);
        $reception->reconcile($batch, $admin, [[
            'pickup_package_id' => $package->id,
            'result' => 'received',
        ]]);

        $hub = ServiceLocation::query()->create([
            'code' => 'HUB-HANDOVER',
            'name' => 'Sede de entrega',
            'address_line1' => 'Calle 20 # 30-40',
        ]);
        $transferred = app(CollectorHandoverService::class)->handover($task->refresh(), $hub, $admin);

        $this->assertSame(1, $transferred);
        $this->assertDatabaseHas('custody_events', [
            'shipment_id' => $package->shipment_id,
            'event_type' => 'collector_handover_to_hub',
            'new_custodian_type' => 'hub',
            'new_custodian_id' => $hub->id,
        ]);
    }

    /** @return array{PickupRequest, PickupPackage, OperationalTask} */
    private function materializedPickup(User $admin, IntakeMode $mode = IntakeMode::PICKUP_AT_CLIENT_LOCATION): array
    {
        $client = Client::query()->create(['name' => 'Cliente recogida']);
        $serviceLocation = $mode->requiresServiceLocation()
            ? ServiceLocation::query()->create([
                'code' => 'HUB-'.str()->upper(str()->random(6)),
                'name' => 'Sede Central',
                'address_line1' => 'Calle 1 # 2-3',
            ])
            : null;
        $pickup = PickupRequest::query()->create([
            'pickup_code' => 'PR-'.str()->upper(str()->random(8)),
            'customer_id' => $client->id,
            'source' => 'admin',
            'intake_mode' => $mode,
            'service_location_id' => $serviceLocation?->id,
            'status' => 'accepted',
            'pickup_address_line1' => 'Carrera 10 # 20-30',
            'pickup_city' => 'Bogotá',
            'contact_name' => 'Cliente Bodega',
            'contact_phone' => '3001234567',
            'pickup_window_code' => 'AM',
            'pickup_window_label' => 'Mañana',
            'package_count' => 1,
            'correlation_id' => (string) str()->uuid(),
        ]);
        $shipmentId = DB::table('shipments')->insertGetId([
            'tracking_code' => 'DHE'.str()->upper(str()->random(12)),
            'display_code' => '#'.str()->upper(str()->random(8)),
            'sequence_number' => random_int(1000, 999999),
            'client_id' => $client->id,
            'created_by' => $admin->id,
            'recipient_name' => 'Destinatario',
            'recipient_phone' => '3009998877',
            'recipient_address' => 'Calle 50 # 10-20',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $package = PickupPackage::query()->create([
            'pickup_request_id' => $pickup->id,
            'package_index' => 1,
            'recipient_name' => 'Destinatario',
            'recipient_phone' => '3009998877',
            'delivery_address_line1' => 'Calle 50 # 10-20',
            'is_cod' => false,
            'shipment_id' => $shipmentId,
            'guide_number' => 'DHE-TEST',
        ]);
        $task = app(OperationalTaskService::class)->createForPickupRequest($pickup);

        return [$pickup, $package, $task];
    }
}
