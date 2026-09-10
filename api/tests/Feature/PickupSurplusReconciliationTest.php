<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Operations\Enums\AssigneeType;
use App\Domain\Operations\Enums\IntakeMode;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Pickup\Services\AddPickupPackage;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class PickupSurplusReconciliationTest extends TestCase
{
    use RefreshDatabase;

    public function test_diego_scenario_declared_3_and_arrived_5_packages(): void
    {
        Storage::fake('public');
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();

        [$pickup, $packages, $task] = $this->createPickupWithThreePackages($admin, IntakeMode::WALK_IN_AT_HUB);

        $task->update([
            'assignee_type' => AssigneeType::HUB_OPERATOR,
            'assigned_user_id' => $admin->id,
            'assigned_executor_name' => $admin->name,
        ]);
        $taskService = app(OperationalTaskService::class);
        $task = $taskService->transition($task, OperationalTaskStatus::ASSIGNED);
        $task = $taskService->transition($task, OperationalTaskStatus::ACCEPTED);
        $task = $taskService->transition($task, OperationalTaskStatus::IN_PROGRESS);

        Sanctum::actingAs($admin);

        // Iniciar lote
        $batchResponse = $this->postJson("/api/operational-tasks/{$task->id}/batch", [
            'delivered_by_name' => 'Empleado Remitente',
            'delivered_by_phone' => '3001112233',
            'delivered_by_relationship' => 'client_contact',
            'delivered_by_notes' => 'Trajo dos paquetes adicionales no declarados en la solicitud.',
        ])->assertCreated();

        $batchId = $batchResponse->json('data.id');
        $this->assertSame(3, $batchResponse->json('data.expected_packages'));

        // Conciliar: 3 declarados como recibidos + 2 excedentes sin declarar
        $reconcilePayload = [
            'items' => [
                [
                    'pickup_package_id' => $packages[0]->id,
                    'result' => 'received',
                    'physical_condition' => 'intact',
                ],
                [
                    'pickup_package_id' => $packages[1]->id,
                    'result' => 'received',
                    'physical_condition' => 'intact',
                ],
                [
                    'pickup_package_id' => $packages[2]->id,
                    'result' => 'received',
                    'physical_condition' => 'intact',
                ],
            ],
            'undeclared_packages' => [
                [
                    'recipient_name' => 'Destinatario Extra 1',
                    'recipient_phone' => '3004445566',
                    'delivery_address_line1' => 'Calle 100 # 15-20',
                    'delivery_address_complement' => 'Apto 401',
                    'delivery_zone' => 'Usaquén',
                    'delivery_city' => 'Bogotá',
                    'payment_type' => 'post_sale',
                    'is_cod' => false,
                    'is_fragile' => true,
                    'physical_condition' => 'intact',
                    'exception_code' => 'SURPLUS_UNANNOUNCED_PACKAGE',
                    'exception_notes' => 'Primer paquete extra entregado físicamente en mostrador.',
                    'evidence_photo' => UploadedFile::fake()->image('extra_package_1.jpg'),
                ],
                [
                    'recipient_name' => 'Destinatario Extra 2',
                    'recipient_phone' => '3007778899',
                    'delivery_address_line1' => 'Carrera 7 # 72-10',
                    'delivery_address_complement' => 'Oficina 502',
                    'delivery_zone' => 'Chapinero',
                    'delivery_city' => 'Bogotá',
                    'payment_type' => 'cash_on_delivery',
                    'is_cod' => true,
                    'requested_cod_amount' => 85000,
                    'is_fragile' => false,
                    'physical_condition' => 'intact',
                    'exception_code' => 'SURPLUS_UNANNOUNCED_PACKAGE',
                    'exception_notes' => 'Segundo paquete extra con cobro contra entrega.',
                    'evidence_photo' => UploadedFile::fake()->image('extra_package_2.jpg'),
                ],
            ],
        ];

        $reconcileResponse = $this->post("/api/operational-pickup-batches/{$batchId}/reconcile", $reconcilePayload, [
            'Accept' => 'application/json',
        ])->assertOk();

        // 1. Verificación del lote
        $reconcileResponse->assertJsonPath('data.status', 'completed_with_differences')
            ->assertJsonPath('data.expected_packages', 3)
            ->assertJsonPath('data.received_packages', 3)
            ->assertJsonPath('data.rejected_packages', 0)
            ->assertJsonPath('data.missing_packages', 0)
            ->assertJsonPath('data.undeclared_packages', 2);

        $this->assertDatabaseHas('pickup_batches', [
            'id' => $batchId,
            'status' => 'completed_with_differences',
            'expected_packages' => 3,
            'received_packages' => 3,
            'undeclared_packages' => 2,
        ]);

        // 2. Verificación de la solicitud: package_count SIGUE siendo 3 (NO se reescribe)
        $this->assertDatabaseHas('pickup_requests', [
            'id' => $pickup->id,
            'package_count' => 3,
            'status' => 'partially_picked_up',
        ]);

        // 3. Verificación de paquetes: existen 5 paquetes y todos tienen shipment_id
        $allPackages = PickupPackage::query()->where('pickup_request_id', $pickup->id)->orderBy('package_index')->get();
        $this->assertCount(5, $allPackages);
        foreach ($allPackages as $pkg) {
            $this->assertNotNull($pkg->shipment_id, "El paquete con index {$pkg->package_index} debe tener shipment_id asignado.");
        }

        // Los 2 paquetes extra deben tener added_at_reception_at registrado
        $undeclaredPkgs = PickupPackage::query()->where('pickup_request_id', $pickup->id)->whereNotNull('added_at_reception_at')->get();
        $this->assertCount(2, $undeclaredPkgs);

        // 4. Verificación de envíos: los 5 envíos existen y están en bodega
        $shipmentIds = $allPackages->pluck('shipment_id')->all();
        $this->assertCount(5, array_unique($shipmentIds));
        $this->assertSame(5, DB::table('shipments')->whereIn('id', $shipmentIds)->where('status', ShipmentStatus::IN_WAREHOUSE->value)->count());

        // 5. Verificación de eventos de custodia: 5 eventos de custodia registrados
        $this->assertSame(5, DB::table('custody_events')->whereIn('shipment_id', $shipmentIds)->count());

        // 6. Verificación del Comprobante (Receipt)
        $receiptResponse = $this->getJson("/api/operational-pickup-batches/{$batchId}/receipt")
            ->assertOk();

        $receiptResponse->assertJsonPath('data.summary.expected_packages', 3)
            ->assertJsonPath('data.summary.received_packages', 3)
            ->assertJsonPath('data.summary.rejected_packages', 0)
            ->assertJsonPath('data.summary.missing_packages', 0)
            ->assertJsonPath('data.summary.undeclared_packages', 2)
            ->assertJsonPath('data.summary.has_differences', true);

        // Verificar renglones del comprobante con etiqueta "Recibido sin declarar"
        $receiptItems = collect($receiptResponse->json('data.items'));
        $this->assertCount(5, $receiptItems);
        $undeclaredItems = $receiptItems->where('result', 'undeclared');
        $this->assertCount(2, $undeclaredItems);
        foreach ($undeclaredItems as $item) {
            $this->assertSame('Recibido sin declarar', $item['result_label']);
            $this->assertNotEmpty($item['evidence']);
        }
    }

    public function test_undeclared_package_without_photo_or_causal_fails_validation(): void
    {
        Storage::fake('public');
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();

        [$pickup, $packages, $task] = $this->createPickupWithThreePackages($admin, IntakeMode::WALK_IN_AT_HUB);

        $task->update([
            'assignee_type' => AssigneeType::HUB_OPERATOR,
            'assigned_user_id' => $admin->id,
            'assigned_executor_name' => $admin->name,
        ]);
        $taskService = app(OperationalTaskService::class);
        $task = $taskService->transition($task, OperationalTaskStatus::ASSIGNED);
        $task = $taskService->transition($task, OperationalTaskStatus::ACCEPTED);
        $task = $taskService->transition($task, OperationalTaskStatus::IN_PROGRESS);

        Sanctum::actingAs($admin);

        $batch = $this->postJson("/api/operational-tasks/{$task->id}/batch")->assertCreated();
        $batchId = $batch->json('data.id');

        // Intento 1: Excedente sin foto de evidencia
        $this->post("/api/operational-pickup-batches/{$batchId}/reconcile", [
            'items' => [
                ['pickup_package_id' => $packages[0]->id, 'result' => 'received'],
                ['pickup_package_id' => $packages[1]->id, 'result' => 'received'],
                ['pickup_package_id' => $packages[2]->id, 'result' => 'received'],
            ],
            'undeclared_packages' => [
                [
                    'recipient_name' => 'Destinatario Sin Foto',
                    'recipient_phone' => '3001112233',
                    'delivery_address_line1' => 'Calle 1 # 2-3',
                    'exception_code' => 'SURPLUS_UNANNOUNCED_PACKAGE',
                    // Sin evidence_photo
                ],
            ],
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['items']);

        // El lote sigue abierto en conciliación
        $this->assertDatabaseHas('pickup_batches', [
            'id' => $batchId,
            'status' => 'receiving',
        ]);

        // Intento 2: Excedente sin causal
        $this->post("/api/operational-pickup-batches/{$batchId}/reconcile", [
            'items' => [
                ['pickup_package_id' => $packages[0]->id, 'result' => 'received'],
                ['pickup_package_id' => $packages[1]->id, 'result' => 'received'],
                ['pickup_package_id' => $packages[2]->id, 'result' => 'received'],
            ],
            'undeclared_packages' => [
                [
                    'recipient_name' => 'Destinatario Sin Causal',
                    'recipient_phone' => '3001112233',
                    'delivery_address_line1' => 'Calle 1 # 2-3',
                    'evidence_photo' => UploadedFile::fake()->image('extra.jpg'),
                    'exception_code' => '', // Causal vacía
                ],
            ],
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['items']);

        $this->assertDatabaseHas('pickup_batches', [
            'id' => $batchId,
            'status' => 'receiving',
        ]);
    }

    public function test_latent_bug_observed_damage_closes_completed_with_differences_successfully(): void
    {
        Storage::fake('public');
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();

        [$pickup, $packages, $task] = $this->createPickupWithThreePackages($admin, IntakeMode::WALK_IN_AT_HUB);

        $task->update([
            'assignee_type' => AssigneeType::HUB_OPERATOR,
            'assigned_user_id' => $admin->id,
            'assigned_executor_name' => $admin->name,
        ]);
        $taskService = app(OperationalTaskService::class);
        $task = $taskService->transition($task, OperationalTaskStatus::ASSIGNED);
        $task = $taskService->transition($task, OperationalTaskStatus::ACCEPTED);
        $task = $taskService->transition($task, OperationalTaskStatus::IN_PROGRESS);

        Sanctum::actingAs($admin);

        $batch = $this->postJson("/api/operational-tasks/{$task->id}/batch")->assertCreated();
        $batchId = $batch->json('data.id');

        // Los 3 paquetes se reciben, pero 1 presenta daño observado con foto y causal
        $this->post("/api/operational-pickup-batches/{$batchId}/reconcile", [
            'items' => [
                [
                    'pickup_package_id' => $packages[0]->id,
                    'result' => 'received',
                    'physical_condition' => 'intact',
                ],
                [
                    'pickup_package_id' => $packages[1]->id,
                    'result' => 'received',
                    'physical_condition' => 'observed_damage',
                    'exception_code' => 'PACKAGE_DAMAGED_AT_RECEPTION',
                    'exception_notes' => 'Caja golpeada en una esquina.',
                    'evidence_photo' => UploadedFile::fake()->image('damaged_package.jpg'),
                ],
                [
                    'pickup_package_id' => $packages[2]->id,
                    'result' => 'received',
                    'physical_condition' => 'intact',
                ],
            ],
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed_with_differences')
            ->assertJsonPath('data.received_packages', 3)
            ->assertJsonPath('data.rejected_packages', 0)
            ->assertJsonPath('data.missing_packages', 0)
            ->assertJsonPath('data.undeclared_packages', 0);

        $this->assertDatabaseHas('pickup_batches', [
            'id' => $batchId,
            'status' => 'completed_with_differences',
        ]);
    }

    public function test_assigned_driver_reconciles_undeclared_packages_from_mobile(): void
    {
        Storage::fake('public');
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();
        $driverUser = User::factory()->create(['email' => 'piloto.surplus@danhei.test']);
        $driver = Driver::query()->create([
            'user_id' => $driverUser->id,
            'name' => 'Piloto de Ruta',
            'phone' => '3200000000',
        ]);
        $driverUser->update(['driver_id' => $driver->id]);
        $driverUser->syncRoles([
            Role::query()->where('name', 'driver')->where('guard_name', 'web')->firstOrFail(),
            Role::query()->where('name', 'driver')->where('guard_name', 'sanctum')->firstOrFail(),
        ]);

        [$pickup, $packages, $task] = $this->createPickupWithThreePackages($admin, IntakeMode::PICKUP_AT_CLIENT_LOCATION);

        Sanctum::actingAs($admin);
        $this->postJson("/api/operational-tasks/{$task->id}/assign", [
            'assignee_type' => 'danhei_driver',
            'assigned_driver_id' => $driver->id,
            'scheduled_date' => now()->toDateString(),
        ])->assertOk();

        Sanctum::actingAs($driverUser);
        $this->postJson("/api/driver/pickup-tasks/{$task->id}/transition", ['status' => 'accepted'])->assertOk();
        $this->postJson("/api/driver/pickup-tasks/{$task->id}/transition", ['status' => 'in_progress'])->assertOk();

        $batch = $this->postJson("/api/driver/pickup-tasks/{$task->id}/batch", [
            'lat' => 4.6500,
            'lng' => -74.0500,
        ])->assertCreated();
        $batchId = $batch->json('data.id');

        $this->post("/api/driver/pickup-batches/{$batchId}/reconcile", [
            'items' => [
                ['pickup_package_id' => $packages[0]->id, 'result' => 'received'],
                ['pickup_package_id' => $packages[1]->id, 'result' => 'received'],
                ['pickup_package_id' => $packages[2]->id, 'result' => 'received'],
            ],
            'undeclared_packages' => [
                [
                    'recipient_name' => 'Cliente Extra Piloto',
                    'recipient_phone' => '3009991122',
                    'delivery_address_line1' => 'Calle 80 # 68-20',
                    'exception_code' => 'SURPLUS_COLLECTED_BY_DRIVER',
                    'evidence_photo' => UploadedFile::fake()->image('driver_extra.jpg'),
                ],
            ],
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed_with_differences')
            ->assertJsonPath('data.expected_packages', 3)
            ->assertJsonPath('data.received_packages', 3)
            ->assertJsonPath('data.undeclared_packages', 1);

        $this->assertDatabaseHas('pickup_batches', [
            'id' => $batchId,
            'undeclared_packages' => 1,
        ]);

        $this->assertDatabaseHas('pickup_requests', [
            'id' => $pickup->id,
            'package_count' => 3,
        ]);

        $this->assertDatabaseHas('pickup_batch_item_evidence', [
            'source' => 'mobile',
        ]);
    }

    public function test_add_pickup_package_service_still_blocks_adding_packages_once_task_assigned(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();

        [$pickup, $packages, $task] = $this->createPickupWithThreePackages($admin, IntakeMode::WALK_IN_AT_HUB);

        $task->update([
            'assignee_type' => AssigneeType::HUB_OPERATOR,
            'assigned_user_id' => $admin->id,
            'assigned_executor_name' => $admin->name,
        ]);
        app(OperationalTaskService::class)->transition($task, OperationalTaskStatus::ASSIGNED);

        $this->expectException(ValidationException::class);
        app(AddPickupPackage::class)->execute(
            $pickup,
            'admin:'.$admin->id,
            'idemp-'.str()->random(8),
            [
                'recipient_name' => 'Intento Bloqueado',
                'recipient_phone' => '3001112233',
                'delivery_address_line1' => 'Calle 1 # 2-3',
            ]
        );
    }

    /** @return array{PickupRequest, list<PickupPackage>, OperationalTask} */
    private function createPickupWithThreePackages(User $admin, IntakeMode $mode = IntakeMode::WALK_IN_AT_HUB): array
    {
        $client = Client::query()->create([
            'name' => 'Comercial Diego S.A.S.',
            'phone' => '3001234567',
        ]);

        $serviceLocation = ServiceLocation::query()->create([
            'code' => 'HUB-'.str()->upper(str()->random(6)),
            'name' => 'Sede Principal Mostrador',
            'address_line1' => 'Avenida El Dorado # 68C-61',
            'city' => 'Bogotá',
        ]);

        $pickup = PickupRequest::query()->create([
            'pickup_code' => 'PR-'.str()->upper(str()->random(8)),
            'customer_id' => $client->id,
            'source' => 'hub_walk_in',
            'intake_mode' => $mode,
            'service_location_id' => $serviceLocation->id,
            'status' => PickupStatus::ACCEPTED->value,
            'pickup_address_line1' => 'Avenida El Dorado # 68C-61',
            'pickup_city' => 'Bogotá',
            'contact_name' => 'Diego Solicitante',
            'contact_phone' => '3001234567',
            'pickup_window_code' => 'AM',
            'pickup_window_label' => 'Mañana',
            'package_count' => 3, // El cliente declaró 3
            'correlation_id' => (string) str()->uuid(),
        ]);

        $packages = [];
        for ($i = 1; $i <= 3; $i++) {
            $shipmentId = DB::table('shipments')->insertGetId([
                'tracking_code' => 'DHE'.str()->upper(str()->random(12)),
                'display_code' => '#DEC'.str()->padLeft((string) $i, 4, '0'),
                'sequence_number' => random_int(1000, 999999),
                'client_id' => $client->id,
                'created_by' => $admin->id,
                'status' => ShipmentStatus::PICKUP_SCHEDULED->value,
                'recipient_name' => "Destinatario Declarado {$i}",
                'recipient_phone' => "300000000{$i}",
                'recipient_address' => "Calle {$i}0 # 20-30",
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $packages[] = PickupPackage::query()->create([
                'pickup_request_id' => $pickup->id,
                'package_index' => $i,
                'recipient_name' => "Destinatario Declarado {$i}",
                'recipient_phone' => "300000000{$i}",
                'delivery_address_line1' => "Calle {$i}0 # 20-30",
                'is_cod' => false,
                'shipment_id' => $shipmentId,
                'guide_number' => '#DEC'.str()->padLeft((string) $i, 4, '0'),
            ]);
        }

        $task = app(OperationalTaskService::class)->createForPickupRequest($pickup);

        return [$pickup, $packages, $task];
    }
}
