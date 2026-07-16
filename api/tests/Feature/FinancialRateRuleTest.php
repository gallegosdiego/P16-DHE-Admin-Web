<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\DriverServiceEarning;
use App\Domain\Financial\Models\FinancialRateRule;
use App\Domain\Financial\Services\FinancialRateResolver;
use App\Domain\Financial\Services\ReconciliationLedgerService;
use App\Domain\Operations\Enums\AssigneeType;
use App\Domain\Operations\Enums\OperationalTaskStatus;
use App\Domain\Operations\Enums\OperationalTaskType;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class FinancialRateRuleTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Driver $driver;

    private Client $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->seed(DemoDataSeeder::class);
        $this->admin = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();
        $this->driver = Driver::query()->where('status', 'active')->firstOrFail();
        $this->client = Client::query()->firstOrFail();
    }

    public function test_driver_specific_rule_overrides_global_and_legacy_delivery_fee(): void
    {
        $global = $this->createRule([
            'name' => 'Entrega global',
            'service_type' => 'delivery',
            'amount' => 3000,
        ]);
        $driverRule = $this->createRule([
            'name' => 'Entrega piloto preferente',
            'service_type' => 'delivery',
            'scope_type' => 'driver',
            'driver_id' => $this->driver->id,
            'amount' => 4500,
        ]);
        $shipment = $this->createDeliveredShipment(driverFee: 2000);

        app(ReconciliationLedgerService::class)->recordDeliveredShipment($shipment);

        $earning = DriverServiceEarning::query()
            ->where('shipment_id', $shipment->id)
            ->where('service_type', 'delivery')
            ->firstOrFail();

        $this->assertSame(4500, $earning->amount);
        $this->assertSame(4500, $earning->standard_amount);
        $this->assertSame($driverRule->id, $earning->rate_rule_id);
        $this->assertSame($driverRule->rule_key, $earning->rate_snapshot_json['rule_key']);
        $this->assertNotSame($global->id, $earning->rate_rule_id);
    }

    public function test_versioning_preserves_date_history_and_selects_the_new_effective_rule(): void
    {
        $created = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/financial/rate-rules', [
                'name' => 'Recogida base',
                'service_type' => 'pickup',
                'scope_type' => 'global',
                'amount' => 3000,
                'effective_from' => today()->toDateString(),
                'priority' => 10,
                'change_reason' => 'Tarifa inicial aprobada',
            ])
            ->assertCreated();

        $ruleId = $created->json('id');
        $tomorrow = today()->addDay();
        $version = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/rate-rules/{$ruleId}/versions", [
                'name' => 'Recogida base',
                'service_type' => 'pickup',
                'scope_type' => 'global',
                'amount' => 4000,
                'effective_from' => $tomorrow->toDateString(),
                'priority' => 10,
                'change_reason' => 'Ajuste aprobado para nueva vigencia',
            ])
            ->assertCreated()
            ->assertJsonPath('version', 2);

        $old = FinancialRateRule::query()->findOrFail($ruleId);
        $this->assertSame(today()->toDateString(), $old->effective_to?->toDateString());
        $this->assertSame($old->rule_key, $version->json('rule_key'));

        $resolver = app(FinancialRateResolver::class);
        $this->assertSame(3000, $resolver->resolve('pickup', today())['amount']);
        $this->assertSame(4000, $resolver->resolve('pickup', $tomorrow)['amount']);
    }

    public function test_versioning_does_not_extend_an_already_expired_rule(): void
    {
        $rule = $this->createRule([
            'name' => 'Recogida temporal',
            'service_type' => 'pickup',
            'effective_from' => today()->subDays(5),
            'effective_to' => today()->subDays(2),
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/rate-rules/{$rule->id}/versions", [
                'name' => 'Recogida temporal',
                'service_type' => 'pickup',
                'scope_type' => 'global',
                'amount' => 4000,
                'effective_from' => today()->addDays(5)->toDateString(),
                'priority' => 0,
                'change_reason' => 'Nueva vigencia sin reabrir la anterior',
            ])
            ->assertCreated();

        $this->assertSame(
            today()->subDays(2)->toDateString(),
            $rule->fresh()->effective_to?->toDateString(),
        );
    }

    public function test_versioning_from_a_historical_id_continues_the_latest_chain(): void
    {
        $rule = $this->createRule([
            'name' => 'Entrega versionada',
            'effective_from' => today(),
        ]);

        $firstVersion = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/rate-rules/{$rule->id}/versions", [
                'name' => 'Entrega versionada',
                'service_type' => 'delivery',
                'scope_type' => 'global',
                'amount' => 3500,
                'effective_from' => today()->addDay()->toDateString(),
                'priority' => 0,
                'change_reason' => 'Segunda versión aprobada',
            ])
            ->assertCreated()
            ->assertJsonPath('version', 2);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/rate-rules/{$rule->id}/versions", [
                'name' => 'Entrega versionada',
                'service_type' => 'delivery',
                'scope_type' => 'global',
                'amount' => 4000,
                'effective_from' => today()->addDays(2)->toDateString(),
                'priority' => 0,
                'change_reason' => 'Tercera versión desde enlace histórico',
            ])
            ->assertCreated()
            ->assertJsonPath('version', 3)
            ->assertJsonPath('supersedes_rule_id', $firstVersion->json('id'));
    }

    public function test_new_version_cannot_start_before_the_latest_version(): void
    {
        $rule = $this->createRule([
            'name' => 'Recogida futura',
            'service_type' => 'pickup',
            'effective_from' => today()->addDays(3),
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/rate-rules/{$rule->id}/versions", [
                'name' => 'Recogida futura',
                'service_type' => 'pickup',
                'scope_type' => 'global',
                'amount' => 4000,
                'effective_from' => today()->toDateString(),
                'priority' => 0,
                'change_reason' => 'Intento de retroceder la vigencia',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('effective_from');
    }

    public function test_toggle_preserves_the_version_approval_and_audits_the_status_reason(): void
    {
        $rule = $this->createRule([
            'name' => 'Entrega auditable',
            'change_reason' => 'Aprobación comercial original',
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/financial/rate-rules/{$rule->id}/toggle", [
                'is_active' => false,
                'change_reason' => 'Suspensión temporal autorizada',
            ])
            ->assertOk()
            ->assertJsonPath('is_active', false)
            ->assertJsonPath('change_reason', 'Aprobación comercial original')
            ->assertJsonPath('approved_by.id', $this->admin->id);

        $audit = AuditLog::query()
            ->where('action', 'financial.rate_rule_toggled')
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('Suspensión temporal autorizada', $audit->description);
        $this->assertSame(false, $audit->new_values['is_active']);
    }

    public function test_completed_pickup_task_generates_an_earning_from_the_configured_rule(): void
    {
        $rule = $this->createRule([
            'name' => 'Recogida por tarea',
            'service_type' => 'pickup',
            'amount' => 5000,
        ]);
        $task = OperationalTask::query()->create([
            'task_code' => 'OT-TEST-'.Str::upper(Str::random(8)),
            'task_type' => OperationalTaskType::CLIENT_PICKUP,
            'status' => OperationalTaskStatus::IN_PROGRESS,
            'customer_id' => $this->client->id,
            'assignee_type' => AssigneeType::DANHEI_DRIVER,
            'assigned_driver_id' => $this->driver->id,
            'started_at' => now(),
            'created_by' => $this->admin->id,
        ]);

        app(OperationalTaskService::class)->transition($task, OperationalTaskStatus::COMPLETED);

        $earning = DriverServiceEarning::query()
            ->where('operational_task_id', $task->id)
            ->where('service_type', 'pickup')
            ->firstOrFail();
        $this->assertSame(5000, $earning->amount);
        $this->assertSame($rule->id, $earning->rate_rule_id);
    }

    public function test_return_task_without_an_approved_rule_does_not_invent_an_earning(): void
    {
        $task = OperationalTask::query()->create([
            'task_code' => 'OT-TEST-'.Str::upper(Str::random(8)),
            'task_type' => OperationalTaskType::RETURN_TO_HUB,
            'status' => OperationalTaskStatus::IN_PROGRESS,
            'customer_id' => $this->client->id,
            'assignee_type' => AssigneeType::DANHEI_DRIVER,
            'assigned_driver_id' => $this->driver->id,
            'started_at' => now(),
            'created_by' => $this->admin->id,
        ]);

        app(OperationalTaskService::class)->transition($task, OperationalTaskStatus::COMPLETED);

        $this->assertDatabaseMissing('driver_service_earnings', [
            'operational_task_id' => $task->id,
            'service_type' => 'return_to_hub',
        ]);
    }

    public function test_operator_cannot_manage_financial_rate_rules(): void
    {
        $operator = User::query()->where('email', 'operador@danheiexpress.com')->firstOrFail();

        $this->actingAs($operator, 'sanctum')
            ->postJson('/api/financial/rate-rules', [
                'name' => 'No autorizada',
                'service_type' => 'delivery',
                'scope_type' => 'global',
                'amount' => 3000,
                'effective_from' => today()->toDateString(),
                'change_reason' => 'Intento sin permiso',
            ])
            ->assertForbidden();
    }

    /** @param array<string, mixed> $overrides */
    private function createRule(array $overrides): FinancialRateRule
    {
        return FinancialRateRule::query()->create(array_merge([
            'rule_key' => (string) Str::uuid(),
            'version' => 1,
            'name' => 'Tarifa de prueba',
            'service_type' => 'delivery',
            'scope_type' => 'global',
            'amount' => 3000,
            'currency' => 'COP',
            'effective_from' => today(),
            'priority' => 0,
            'is_active' => true,
            'change_reason' => 'Regla creada para prueba',
            'created_by' => $this->admin->id,
            'approved_by' => $this->admin->id,
            'approved_at' => now(),
        ], $overrides));
    }

    private function createDeliveredShipment(int $driverFee): Shipment
    {
        $sequence = (int) (Shipment::withTrashed()->max('sequence_number') ?? 0) + 1;

        return Shipment::query()->create([
            'client_id' => $this->client->id,
            'driver_id' => $this->driver->id,
            'created_by' => $this->admin->id,
            'tracking_code' => sprintf('RAT%014d', $sequence),
            'display_code' => sprintf('#RAT%05d', $sequence),
            'sequence_number' => $sequence,
            'status' => 'delivered',
            'financial_status' => 'pending',
            'recipient_name' => 'Destinatario tarifa',
            'recipient_phone' => '3000000000',
            'recipient_address' => 'Calle 10 # 20-30',
            'recipient_zone' => 'Centro',
            'recipient_city' => 'Bogotá',
            'payment_type' => 'prepaid',
            'shipping_cost' => 10000,
            'cod_amount' => 0,
            'driver_fee' => $driverFee,
            'delivered_at' => now(),
        ]);
    }
}
