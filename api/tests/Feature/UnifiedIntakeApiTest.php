<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class UnifiedIntakeApiTest extends TestCase
{
    use RefreshDatabase;

    private string $token;

    private Client $client;

    protected function setUp(): void
    {
        parent::setUp();
        config(['logging.default' => 'null']);
        $this->seed();
        $this->client = Client::query()->firstOrFail();
        $this->token = (string) $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ])->json('token');
    }

    public function test_walk_in_reports_schema_unavailable_instead_of_internal_error(): void
    {
        Schema::drop('idempotency_records');

        $this->postJson(
            '/api/pickup-intakes/walk-in/complete',
            [],
            $this->auth('walk-in-schema-unavailable'),
        )
            ->assertStatus(503)
            ->assertJsonPath('code', 'operational_intake_unavailable')
            ->assertJsonPath('required_action', 'database_update')
            ->assertJsonPath(
                'message',
                'El módulo de ingreso aún no está listo en el servidor. Debe completarse la actualización de la base de datos.',
            );
    }

    public function test_package_can_be_added_once_with_an_idempotency_key(): void
    {
        $pickup = $this->createPickup('add-package-request');
        $payload = $this->packagePayload('Segundo destinatario', 25000);

        $first = $this->postJson(
            "/api/pickup-requests/{$pickup->id}/packages",
            $payload,
            $this->auth('add-package-001'),
        );
        $replayed = $this->postJson(
            "/api/pickup-requests/{$pickup->id}/packages",
            $payload,
            $this->auth('add-package-001'),
        );

        $first->assertCreated()->assertJsonPath('data.package_index', 2);
        $replayed->assertCreated()->assertJsonPath('data.id', $first->json('data.id'));
        $this->assertDatabaseCount('pickup_packages', 2);
        $this->assertDatabaseHas('pickup_requests', [
            'id' => $pickup->id,
            'package_count' => 2,
            'requested_cod_total' => 40000,
        ]);
    }

    public function test_package_cannot_be_added_after_the_task_is_assigned(): void
    {
        $pickup = $this->createPickup('assigned-request');
        $pickup->tasks()->firstOrFail()->update([
            'status' => 'assigned',
            'assignee_type' => 'hub_operator',
            'assigned_executor_name' => 'Operador',
        ]);

        $this->postJson(
            "/api/pickup-requests/{$pickup->id}/packages",
            $this->packagePayload('Fuera de tiempo', 0),
            $this->auth('late-package-001'),
        )->assertUnprocessable()->assertJsonValidationErrors('pickup_request');

        $this->assertDatabaseCount('pickup_packages', 1);
    }

    public function test_repeated_materialization_does_not_create_a_second_shipment(): void
    {
        $baseline = Shipment::query()->count();
        $pickup = $this->createPickup('materialize-request');
        $this->postJson(
            "/api/pickup-requests/{$pickup->id}/packages",
            $this->packagePayload('Paquete no seleccionado', 0),
            $this->auth('materialize-extra-package'),
        )->assertCreated();
        $pickup->update(['status' => 'accepted', 'accepted_at' => now()]);
        $selectedPackageId = $pickup->packages()->orderBy('package_index')->value('id');
        $payload = [
            'default_shipping_cost' => 12000,
            'default_driver_fee' => 3500,
            'package_ids' => [$selectedPackageId],
        ];

        $first = $this->postJson(
            "/api/pickup-requests/{$pickup->id}/materialize-shipments",
            $payload,
            $this->auth('materialize-001'),
        );
        $second = $this->postJson(
            "/api/pickup-requests/{$pickup->id}/materialize-shipments",
            $payload,
            $this->auth('materialize-002'),
        );

        $first->assertOk()->assertJsonPath('pickup_request.shipments_summary.materialized_packages', 1);
        $second->assertOk()->assertJsonPath('pickup_request.shipments_summary.materialized_packages', 1);
        $this->assertSame($baseline + 1, Shipment::query()->count());
        $this->assertNull($pickup->packages()->where('package_index', 2)->value('shipment_id'));
        $this->assertStringContainsString('solicitud de ingreso', (string) $first->json('message'));
    }

    public function test_internal_employee_assignment_uses_a_real_user_identity(): void
    {
        $pickup = $this->createPickup('employee-request');
        $pickup->update(['status' => 'accepted', 'accepted_at' => now()]);
        $this->postJson(
            "/api/pickup-requests/{$pickup->id}/materialize-shipments",
            ['default_shipping_cost' => 12000, 'default_driver_fee' => 3500],
            $this->auth('employee-materialize'),
        )->assertOk();
        $employee = User::query()->where('email', 'operador@danheiexpress.com')->firstOrFail();
        $task = $pickup->tasks()->firstOrFail();

        $this->postJson("/api/operational-tasks/{$task->id}/assign", [
            'assignee_type' => 'danhei_employee',
            'assigned_user_id' => $employee->id,
        ], $this->auth('employee-assign'))->assertOk()
            ->assertJsonPath('data.assigned_user_id', $employee->id)
            ->assertJsonPath('data.assigned_user.name', $employee->name);

        $this->assertDatabaseHas('operational_tasks', [
            'id' => $task->id,
            'assignee_type' => 'danhei_employee',
            'assigned_user_id' => $employee->id,
            'assigned_executor_name' => $employee->name,
        ]);
    }

    public function test_walk_in_is_completed_atomically_and_replay_safe(): void
    {
        $baselineShipments = Shipment::query()->count();
        $location = ServiceLocation::query()->firstOrCreate(['code' => 'HUB-WALKIN'], [
            'name' => 'Mostrador Central',
            'address_line1' => 'Calle 1 # 2-3',
            'city' => 'Bogotá',
            'is_active' => true,
        ]);
        $payload = [
            'customer_id' => $this->client->id,
            'service_location_id' => $location->id,
            'contact_name' => 'Cliente remitente',
            'contact_phone' => '3000000001',
            'delivered_by_name' => 'Mensajero tercero',
            'delivered_by_phone' => '3000000002',
            'delivered_by_relationship' => 'mensajero',
            'default_shipping_cost' => 12000,
            'default_driver_fee' => 0,
            'packages' => [
                array_merge($this->packagePayload('Paquete recibido', 10000), [
                    'reception_result' => 'received',
                ]),
                array_merge($this->packagePayload('Paquete rechazado', 0), [
                    'reception_result' => 'rejected',
                    'exception_code' => 'DAMAGED_PACKAGE',
                ]),
            ],
        ];

        $first = $this->postJson('/api/pickup-intakes/walk-in/complete', $payload, $this->auth('walk-in-001'));
        $replayed = $this->postJson('/api/pickup-intakes/walk-in/complete', $payload, $this->auth('walk-in-001'));

        $first->assertCreated()
            ->assertJsonPath('data.status', 'partially_picked_up')
            ->assertJsonPath('data.batches.0.received_packages', 1)
            ->assertJsonPath('data.batches.0.rejected_packages', 1)
            ->assertJsonPath('data.batches.0.delivered_by_name', 'Mensajero tercero');
        $replayed->assertCreated()->assertJsonPath('data.id', $first->json('data.id'));

        $this->assertSame($baselineShipments + 1, Shipment::query()->count());
        $this->assertDatabaseCount('pickup_requests', 1);
        $this->assertDatabaseCount('pickup_batches', 1);
        $this->assertDatabaseHas('shipments', ['status' => 'in_warehouse']);
        $this->assertDatabaseHas('custody_events', [
            'event_type' => 'received_at_hub',
            'previous_custodian_type' => 'deliverer',
            'previous_custodian_name' => 'Mensajero tercero',
            'new_custodian_type' => 'hub',
            'new_custodian_id' => $location->id,
        ]);
    }

    public function test_walk_in_keeps_the_session_actor_and_records_an_alternate_physical_receiver(): void
    {
        $location = ServiceLocation::query()->firstOrCreate(['code' => 'HUB-ALTERNATE-RECEIVER'], [
            'name' => 'Mostrador de prueba',
            'address_line1' => 'Calle 10 # 20-30',
            'city' => 'Bogotá',
            'is_active' => true,
        ]);
        $receiver = User::query()->where('email', 'operador@danheiexpress.com')->firstOrFail();
        $payload = [
            'customer_id' => $this->client->id,
            'service_location_id' => $location->id,
            'contact_name' => 'Cliente remitente',
            'contact_phone' => '3000000001',
            'received_by_user_id' => $receiver->id,
            'default_shipping_cost' => 12000,
            'default_driver_fee' => 0,
            'packages' => [array_merge($this->packagePayload('Destinatario alterno', 0), [
                'reception_result' => 'received',
            ])],
        ];

        $response = $this->postJson(
            '/api/pickup-intakes/walk-in/complete',
            $payload,
            $this->auth('walk-in-alternate-receiver'),
        );

        $response->assertCreated()
            ->assertJsonPath('data.tasks.0.assigned_user_id', $receiver->id)
            ->assertJsonPath('data.batches.0.received_by', $receiver->id)
            ->assertJsonPath('data.batches.0.received_by_user.name', $receiver->name);

        $this->assertDatabaseHas('operational_tasks', [
            'pickup_request_id' => $response->json('data.id'),
            'assigned_user_id' => $receiver->id,
        ]);
        $this->assertDatabaseHas('pickup_batches', [
            'pickup_request_id' => $response->json('data.id'),
            'received_by' => $receiver->id,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'operations.walk_in_intake_completed',
            'user_id' => User::query()->where('email', 'admin@danheiexpress.com')->value('id'),
        ]);
    }

    public function test_completed_reception_exposes_a_printable_receipt_with_custody_and_differences(): void
    {
        $location = ServiceLocation::query()->firstOrCreate(['code' => 'HUB-RECEIPT'], [
            'name' => 'Sede comprobante',
            'address_line1' => 'Calle 40 # 10-20',
            'city' => 'BogotÃ¡',
            'is_active' => true,
        ]);
        $payload = [
            'customer_id' => $this->client->id,
            'service_location_id' => $location->id,
            'contact_name' => 'Cliente del comprobante',
            'contact_phone' => '3000000011',
            'delivered_by_name' => 'Mensajero autorizado',
            'delivered_by_phone' => '3000000012',
            'delivered_by_relationship' => 'mensajero',
            'default_shipping_cost' => 12000,
            'default_driver_fee' => 0,
            'packages' => [
                array_merge($this->packagePayload('Destinatario recibido', 0), [
                    'reception_result' => 'received',
                ]),
                array_merge($this->packagePayload('Destinatario rechazado', 0), [
                    'reception_result' => 'rejected',
                    'exception_code' => 'DAMAGED_PACKAGE',
                    'exception_notes' => 'Empaque roto al recibir.',
                ]),
            ],
        ];

        $created = $this->postJson(
            '/api/pickup-intakes/walk-in/complete',
            $payload,
            $this->auth('walk-in-receipt-001'),
        )->assertCreated();

        $batchId = $created->json('data.batches.0.id');

        $this->getJson(
            "/api/pickup-requests/{$created->json('data.id')}",
            $this->auth('receipt-detail-001'),
        )->assertOk()
            ->assertJsonPath('reception_batches.0.id', $batchId)
            ->assertJsonPath('reception_batches.0.status', 'completed_with_differences');

        $this->getJson(
            "/api/operational-pickup-batches/{$batchId}/receipt",
            $this->auth('receipt-read-001'),
        )->assertOk()
            ->assertJsonPath('data.receipt_code', $created->json('data.batches.0.batch_code'))
            ->assertJsonPath('data.status', 'completed_with_differences')
            ->assertJsonPath('data.service_location.code', 'HUB-RECEIPT')
            ->assertJsonPath('data.received_by.name', 'Angel Danhei')
            ->assertJsonPath('data.delivered_by.name', 'Mensajero autorizado')
            ->assertJsonPath('data.summary.expected_packages', 2)
            ->assertJsonPath('data.summary.received_packages', 1)
            ->assertJsonPath('data.summary.rejected_packages', 1)
            ->assertJsonPath('data.summary.missing_packages', 0)
            ->assertJsonPath('data.items.1.result', 'rejected')
            ->assertJsonPath('data.items.1.exception_code', 'DAMAGED_PACKAGE')
            ->assertJsonPath('data.items.1.exception_notes', 'Empaque roto al recibir.');
    }

    public function test_open_reception_does_not_expose_a_final_receipt(): void
    {
        $pickup = $this->createPickup('open-receipt-request');
        $pickup->update(['status' => 'accepted', 'accepted_at' => now()]);
        $this->postJson(
            "/api/pickup-requests/{$pickup->id}/materialize-shipments",
            ['default_shipping_cost' => 12000, 'default_driver_fee' => 3500],
            $this->auth('open-receipt-materialize'),
        )->assertOk();

        $employee = User::query()->where('email', 'operador@danheiexpress.com')->firstOrFail();
        $task = $pickup->tasks()->firstOrFail();
        $this->postJson("/api/operational-tasks/{$task->id}/assign", [
            'assignee_type' => 'danhei_employee',
            'assigned_user_id' => $employee->id,
        ], $this->auth('open-receipt-assign'))->assertOk();
        foreach (['accepted', 'in_progress'] as $status) {
            $this->postJson("/api/operational-tasks/{$task->id}/transition", [
                'status' => $status,
            ], $this->auth("open-receipt-{$status}"))->assertOk();
        }

        $batch = $this->postJson(
            "/api/operational-tasks/{$task->id}/batch",
            [],
            $this->auth('open-receipt-batch'),
        )->assertCreated();

        $this->getJson(
            "/api/operational-pickup-batches/{$batch->json('data.id')}/receipt",
            $this->auth('open-receipt-read'),
        )->assertStatus(409)
            ->assertJsonPath('code', 'reception_receipt_unavailable');
    }

    public function test_scheduled_reception_preserves_the_actual_deliverer(): void
    {
        $pickup = $this->createPickup('scheduled-deliverer');
        $pickup->update(['status' => 'accepted', 'accepted_at' => now()]);
        $this->postJson(
            "/api/pickup-requests/{$pickup->id}/materialize-shipments",
            ['default_shipping_cost' => 12000, 'default_driver_fee' => 3500],
            $this->auth('scheduled-materialize'),
        )->assertOk();

        $employee = User::query()->where('email', 'operador@danheiexpress.com')->firstOrFail();
        $task = $pickup->tasks()->firstOrFail();
        $this->postJson("/api/operational-tasks/{$task->id}/assign", [
            'assignee_type' => 'danhei_employee',
            'assigned_user_id' => $employee->id,
        ], $this->auth('scheduled-assign'))->assertOk();
        foreach (['accepted', 'in_progress'] as $status) {
            $this->postJson("/api/operational-tasks/{$task->id}/transition", [
                'status' => $status,
            ], $this->auth("scheduled-{$status}"))->assertOk();
        }

        $this->postJson("/api/operational-tasks/{$task->id}/batch", [
            'delivered_by_name' => 'Auxiliar del cliente',
            'delivered_by_phone' => '3009876543',
            'delivered_by_relationship' => 'auxiliar',
            'delivered_by_notes' => 'Presentó autorización física.',
        ], $this->auth('scheduled-batch'))->assertCreated()
            ->assertJsonPath('data.delivered_by_name', 'Auxiliar del cliente')
            ->assertJsonPath('data.notes', 'Presentó autorización física.');

        $this->assertDatabaseHas('pickup_batches', [
            'operational_task_id' => $task->id,
            'delivered_by_name' => 'Auxiliar del cliente',
            'delivered_by_relationship' => 'auxiliar',
            'notes' => 'Presentó autorización física.',
        ]);
    }

    public function test_intake_board_can_filter_by_mode_and_exposes_the_service_location(): void
    {
        $this->createPickup('filter-field-pickup');
        $location = ServiceLocation::query()->firstOrCreate(['code' => 'HUB-FILTER'], [
            'name' => 'Sede para filtro',
            'address_line1' => 'Carrera 15 # 20-30',
            'city' => 'Bogotá',
            'is_active' => true,
        ]);
        $this->postJson('/api/pickup-intakes', [
            'customer_id' => $this->client->id,
            'source' => 'admin',
            'intake_mode' => 'planned_dropoff_at_hub',
            'service_location_id' => $location->id,
            'planned_dropoff_at' => now()->addDay()->toISOString(),
            'contact_name' => 'Cliente remitente',
            'contact_phone' => '3000000001',
            'packages' => [$this->packagePayload('Destinatario en sede', 0)],
        ], $this->auth('filter-hub-pickup'))->assertCreated();

        $this->getJson(
            '/api/pickup-requests?intake_mode=planned_dropoff_at_hub',
            $this->auth('filter-list'),
        )->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.intake_mode', 'planned_dropoff_at_hub')
            ->assertJsonPath('data.0.service_location.id', $location->id)
            ->assertJsonPath('summary.total', 1);
    }

    private function createPickup(string $idempotencyKey): PickupRequest
    {
        $response = $this->postJson('/api/pickup-intakes', [
            'customer_id' => $this->client->id,
            'source' => 'admin',
            'intake_mode' => 'pickup_at_client_location',
            'pickup_address_line1' => 'Carrera 7 # 80-20',
            'pickup_city' => 'Bogotá',
            'contact_name' => 'Cliente remitente',
            'contact_phone' => '3000000001',
            'packages' => [$this->packagePayload('Primer destinatario', 15000)],
        ], $this->auth($idempotencyKey));
        $response->assertCreated();

        return PickupRequest::query()->findOrFail($response->json('data.id'));
    }

    /** @return array<string, mixed> */
    private function packagePayload(string $recipient, int $cod): array
    {
        return [
            'recipient_name' => $recipient,
            'recipient_phone' => '3010000001',
            'delivery_address_line1' => 'Calle 50 # 10-15',
            'delivery_city' => 'Bogotá',
            'is_cod' => $cod > 0,
            'requested_cod_amount' => $cod,
        ];
    }

    /** @return array<string, string> */
    private function auth(string $idempotencyKey): array
    {
        return [
            'Authorization' => "Bearer {$this->token}",
            'Idempotency-Key' => $idempotencyKey,
        ];
    }
}
