<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Operations\Enums\AssigneeType;
use App\Domain\Operations\Enums\IntakeMode;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Pickup\Enums\PickupBatchStatus;
use App\Domain\Pickup\Models\PickupBatch;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Pickup\Services\PickupBatchService;
use App\Domain\Shared\Services\IdempotencyService;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Services\CustodyRecorder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use LogicException;
use Tests\TestCase;

class OperationalFoundationTest extends TestCase
{
    use RefreshDatabase;

    public function test_intake_modes_express_the_three_supported_entry_paths(): void
    {
        $this->assertTrue(IntakeMode::PICKUP_AT_CLIENT_LOCATION->requiresFieldAssignment());
        $this->assertFalse(IntakeMode::PICKUP_AT_CLIENT_LOCATION->requiresServiceLocation());
        $this->assertTrue(IntakeMode::PLANNED_DROPOFF_AT_HUB->requiresServiceLocation());
        $this->assertTrue(IntakeMode::WALK_IN_AT_HUB->requiresServiceLocation());
    }

    public function test_it_creates_only_one_active_pickup_task(): void
    {
        $request = $this->pickupRequest(IntakeMode::PICKUP_AT_CLIENT_LOCATION);
        $service = app(OperationalTaskService::class);

        $task = $service->createForPickupRequest($request);

        $this->assertSame('client_pickup', $task->task_type->value);
        $this->assertSame(OperationalTaskStatus::PENDING, $task->status);

        $this->expectException(ValidationException::class);
        $service->createForPickupRequest($request);
    }

    public function test_hub_intake_requires_and_uses_a_service_location(): void
    {
        $request = $this->pickupRequest(IntakeMode::WALK_IN_AT_HUB);

        try {
            app(OperationalTaskService::class)->createForPickupRequest($request);
            $this->fail('A hub intake without a service location should fail.');
        } catch (ValidationException) {
            $this->assertDatabaseCount('operational_tasks', 0);
        }

        $location = ServiceLocation::query()->create([
            'code' => 'HUB-CENTRAL',
            'name' => 'Sede Central',
            'address_line1' => 'Calle 1 # 2-3',
        ]);
        $request->update(['service_location_id' => $location->id]);

        $task = app(OperationalTaskService::class)->createForPickupRequest($request->refresh());

        $this->assertSame('hub_intake', $task->task_type->value);
        $this->assertSame($location->id, $task->service_location_id);
    }

    public function test_task_transitions_require_an_assignee_and_stamp_the_timeline(): void
    {
        $task = app(OperationalTaskService::class)
            ->createForPickupRequest($this->pickupRequest(IntakeMode::PICKUP_AT_CLIENT_LOCATION));

        try {
            app(OperationalTaskService::class)->transition($task, OperationalTaskStatus::ASSIGNED);
            $this->fail('An unassigned task should not transition to assigned.');
        } catch (ValidationException) {
            $this->assertNull($task->refresh()->assigned_at);
        }

        $driver = Driver::query()->create(['name' => 'Ángel', 'phone' => '3000000000']);
        $task->update([
            'assignee_type' => AssigneeType::DANHEI_DRIVER,
            'assigned_driver_id' => $driver->id,
        ]);

        $service = app(OperationalTaskService::class);
        $task = $service->transition($task, OperationalTaskStatus::ASSIGNED);
        $task = $service->transition($task, OperationalTaskStatus::ACCEPTED);
        $task = $service->transition($task, OperationalTaskStatus::IN_PROGRESS);
        $task = $service->transition($task, OperationalTaskStatus::COMPLETED);

        $this->assertNotNull($task->assigned_at);
        $this->assertNotNull($task->accepted_at);
        $this->assertNotNull($task->started_at);
        $this->assertNotNull($task->completed_at);
        $this->assertTrue($task->status->isTerminal());
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'operations.task_transitioned',
            'entity_id' => $task->id,
        ]);
    }

    public function test_batch_closure_accounts_for_every_expected_package(): void
    {
        $request = $this->pickupRequest(IntakeMode::PICKUP_AT_CLIENT_LOCATION);
        $batch = PickupBatch::query()->create([
            'batch_code' => 'PB-001',
            'pickup_request_id' => $request->id,
            'intake_mode' => IntakeMode::PICKUP_AT_CLIENT_LOCATION,
            'expected_packages' => 10,
            'received_packages' => 8,
            'missing_packages' => 2,
        ]);
        $service = app(PickupBatchService::class);
        $batch = $service->transition($batch, PickupBatchStatus::RECEIVING);

        try {
            $service->transition($batch, PickupBatchStatus::COMPLETED);
            $this->fail('A batch with differences cannot close as completed.');
        } catch (ValidationException) {
            $this->assertSame(PickupBatchStatus::RECEIVING, $batch->refresh()->status);
        }

        $batch = $service->transition($batch, PickupBatchStatus::COMPLETED_WITH_DIFFERENCES);

        $this->assertSame(PickupBatchStatus::COMPLETED_WITH_DIFFERENCES, $batch->status);
        $this->assertNotNull($batch->completed_at);
    }

    public function test_custody_history_is_continuous_and_append_only(): void
    {
        $shipment = $this->shipment();
        $recorder = app(CustodyRecorder::class);
        $first = $recorder->record($shipment, [
            'event_type' => 'received_from_client',
            'new_custodian_type' => 'hub',
            'new_custodian_id' => 1,
            'new_custodian_name' => 'Sede Central',
        ]);
        $second = $recorder->record($shipment, [
            'event_type' => 'assigned_to_driver',
            'new_custodian_type' => 'driver',
            'new_custodian_id' => 9,
            'new_custodian_name' => 'Ángel',
        ]);

        $this->assertSame('hub', $second->previous_custodian_type);
        $this->assertSame(1, $second->previous_custodian_id);

        $this->expectException(LogicException::class);
        $first->update(['new_custodian_name' => 'Alterado']);
    }

    public function test_idempotency_replays_the_same_creation_and_rejects_key_reuse(): void
    {
        $service = app(IdempotencyService::class);
        $executions = 0;
        $callback = function () use (&$executions): ServiceLocation {
            $executions++;

            return ServiceLocation::query()->create([
                'code' => 'HUB-IDEMPOTENT',
                'name' => 'Sede idempotente',
                'address_line1' => 'Calle 50 # 10-20',
            ]);
        };

        $first = $service->runForModel('admin:1', 'request-123', 'create_location', [
            'name' => 'Sede idempotente',
            'city' => 'Bogotá',
        ], $callback);
        $replayed = $service->runForModel('admin:1', 'request-123', 'create_location', [
            'city' => 'Bogotá',
            'name' => 'Sede idempotente',
        ], $callback);

        $this->assertSame($first->id, $replayed->id);
        $this->assertSame(1, $executions);

        $this->expectException(ValidationException::class);
        $service->runForModel('admin:1', 'request-123', 'create_location', [
            'name' => 'Contenido diferente',
        ], $callback);
    }

    private function pickupRequest(IntakeMode $mode): PickupRequest
    {
        $client = Client::query()->create(['name' => 'Cliente de prueba']);

        return PickupRequest::query()->create([
            'pickup_code' => 'PR-'.str()->upper(str()->random(8)),
            'customer_id' => $client->id,
            'source' => 'admin',
            'intake_mode' => $mode,
            'status' => 'submitted',
            'pickup_address_line1' => 'Carrera 10 # 20-30',
            'contact_name' => 'Contacto',
            'contact_phone' => '3001234567',
            'pickup_window_code' => 'AM',
            'pickup_window_label' => 'Mañana',
            'package_count' => 1,
            'correlation_id' => (string) str()->uuid(),
        ]);
    }

    private function shipment(): Shipment
    {
        $user = User::factory()->create();
        $client = Client::query()->create(['name' => 'Cliente custodia']);
        $id = DB::table('shipments')->insertGetId([
            'tracking_code' => 'DHE2026071100001',
            'display_code' => '#DHE00001',
            'sequence_number' => 1,
            'client_id' => $client->id,
            'created_by' => $user->id,
            'recipient_name' => 'Destinatario',
            'recipient_phone' => '3001112233',
            'recipient_address' => 'Calle 20 # 30-40',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return Shipment::query()->findOrFail($id);
    }
}
