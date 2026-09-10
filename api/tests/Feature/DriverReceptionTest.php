<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class DriverReceptionTest extends TestCase
{
    use RefreshDatabase;

    private User $driverUser;

    private Driver $driver;

    private User $otherDriverUser;

    private Driver $otherDriver;

    private User $admin;

    private Client $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->seed(DemoDataSeeder::class);

        $this->admin = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();
        $this->client = Client::query()->firstOrFail();
        $drivers = Driver::query()->where('status', 'active')->orderBy('id')->take(2)->get();
        $this->driver = $drivers->first();
        $this->otherDriver = $drivers->last();
        $this->driverUser = $this->linkDriverUser($this->driver, 'reception-driver@danhei.test');
        $this->otherDriverUser = $this->linkDriverUser($this->otherDriver, 'other-reception-driver@danhei.test');
    }

    public function test_validation_accepts_a_receivable_package_without_mutating_status_or_custody(): void
    {
        $shipment = $this->createShipmentInHubCustody();
        $before = [
            'status' => $shipment->status->value,
            'driver_id' => $shipment->driver_id,
            'custody_count' => CustodyEvent::query()->where('shipment_id', $shipment->id)->count(),
            'latest_custodian' => CustodyEvent::query()->where('shipment_id', $shipment->id)->latest('id')->value('new_custodian_type'),
        ];

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/reception/validate', ['scan_code' => $shipment->tracking_code])
            ->assertOk()
            ->assertJsonPath('accepted', true)
            ->assertJsonPath('package.id', $shipment->id)
            ->assertJsonPath('package.tracking_code', $shipment->tracking_code)
            ->assertJsonPath('package.recipient_name', 'Destinatario Recepción')
            ->assertJsonPath('package.recipient_zone', 'Kennedy')
            ->assertJsonPath('reason', null);

        $after = [
            'status' => $shipment->fresh()->status->value,
            'driver_id' => $shipment->fresh()->driver_id,
            'custody_count' => CustodyEvent::query()->where('shipment_id', $shipment->id)->count(),
            'latest_custodian' => CustodyEvent::query()->where('shipment_id', $shipment->id)->latest('id')->value('new_custodian_type'),
        ];

        $this->assertSame($before, $after);
        $this->assertSame($shipment->tracking_code, $response->json('scan_code'));
    }

    public function test_validation_reports_every_business_rejection_reason(): void
    {
        $delivered = $this->createShipmentInHubCustody(['status' => 'delivered']);
        $cancelled = $this->createShipmentInHubCustody(['status' => 'cancelled']);
        $wrongStatus = $this->createShipmentInHubCustody(['status' => 'registered']);
        $withoutCustody = $this->createShipment();
        $otherCustody = $this->createShipment(['driver_id' => $this->otherDriver->id]);
        $this->recordDriverCustody($otherCustody, $this->otherDriver);
        $assignedElsewhere = $this->createShipmentInHubCustody(['driver_id' => $this->otherDriver->id]);
        $alreadyMine = $this->createShipment(['driver_id' => $this->driver->id]);
        $this->recordDriverCustody($alreadyMine, $this->driver);

        $cases = [
            ['missing-code', 'not_found'],
            [$delivered->tracking_code, 'already_delivered'],
            [$cancelled->tracking_code, 'cancelled'],
            [$wrongStatus->tracking_code, 'status_not_eligible'],
            [$withoutCustody->tracking_code, 'not_in_hub_custody'],
            [$otherCustody->tracking_code, 'other_driver_custody'],
            [$assignedElsewhere->tracking_code, 'assigned_to_other_driver'],
            [$alreadyMine->tracking_code, 'already_received_by_driver'],
        ];

        foreach ($cases as [$scanCode, $reasonCode]) {
            $this->actingAs($this->driverUser, 'sanctum')
                ->postJson('/api/driver/reception/validate', ['scan_code' => $scanCode])
                ->assertOk()
                ->assertJsonPath('accepted', false)
                ->assertJsonPath('reason_code', $reasonCode)
                ->assertJson(fn ($json) => $json->whereType('reason', 'string')->etc());
        }
    }

    public function test_three_package_batch_accepts_two_and_rejects_only_the_conflict(): void
    {
        $first = $this->createShipmentInHubCustody();
        $conflict = $this->createShipment(['driver_id' => $this->otherDriver->id]);
        $this->recordDriverCustody($conflict, $this->otherDriver);
        $third = $this->createShipmentInHubCustody();
        $routeCountBefore = DB::table('routes')->count();

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/reception/confirm', $this->confirmPayload([
                ['scan_code' => $first->tracking_code, 'physical_condition' => 'intact'],
                ['scan_code' => $conflict->tracking_code, 'physical_condition' => 'intact'],
                ['scan_code' => $third->tracking_code, 'physical_condition' => 'observed_damage'],
            ]), ['Idempotency-Key' => 'reception-mixed-batch'])
            ->assertOk()
            ->assertJsonPath('summary.accepted_count', 3)
            ->assertJsonPath('summary.rejected_count', 0)
            ->assertJsonPath('accepted.1.package.id', $conflict->id)
            ->assertJsonPath('accepted.1.correlation', 'transferred');

        $this->assertSame([$first->id, $conflict->id, $third->id], collect($response->json('accepted'))->pluck('package.id')->all());
        $this->assertSame('handed_to_driver', $first->fresh()->status->value);
        $this->assertSame('handed_to_driver', $third->fresh()->status->value);
        $this->assertSame($this->driver->id, $conflict->fresh()->driver_id);
        $this->assertGreaterThanOrEqual($routeCountBefore, DB::table('routes')->count());
        $this->assertSame(1, DB::table('routes')->where('driver_id', $this->driver->id)->whereDate('route_date', now()->toDateString())->count());
        $this->assertSame(3, DB::table('route_stops')->whereIn('shipment_id', [$first->id, $conflict->id, $third->id])->count());
        $this->assertDatabaseHas('custody_events', [
            'shipment_id' => $first->id,
            'new_custodian_type' => 'driver',
            'new_custodian_id' => $this->driver->id,
            'lat' => 4.6097100,
            'lng' => -74.0817500,
        ]);
        $this->assertSame(
            'P15-test-device',
            CustodyEvent::query()
                ->where('shipment_id', $first->id)
                ->latest('id')
                ->firstOrFail()
                ->metadata_json['device_id'],
        );
    }

    public function test_same_idempotency_key_and_content_returns_the_exact_result_once(): void
    {
        $shipment = $this->createShipmentInHubCustody();
        $payload = $this->confirmPayload([
            ['scan_code' => $shipment->tracking_code, 'physical_condition' => 'intact'],
        ]);

        $first = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/reception/confirm', $payload, ['Idempotency-Key' => 'stable-reception-session'])
            ->assertOk();
        $second = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/reception/confirm', $payload, ['Idempotency-Key' => 'stable-reception-session'])
            ->assertOk();

        $this->assertSame($first->json(), $second->json());
        $this->assertSame(1, CustodyEvent::query()
            ->where('shipment_id', $shipment->id)
            ->where('event_type', 'assigned_to_driver')
            ->count());
        $this->assertDatabaseCount('idempotency_records', 1);
        $this->assertDatabaseHas('shipment_events', [
            'shipment_id' => $shipment->id,
            'from_status' => 'in_warehouse',
            'to_status' => 'handed_to_driver',
        ]);
        $this->assertSame(1, $shipment->events()->where('to_status', 'handed_to_driver')->count());
    }

    public function test_confirmation_supports_guide_visible_code_and_opaque_token_formats(): void
    {
        $byGuide = $this->createShipmentInHubCustody();
        $byVisibleCode = $this->createShipmentInHubCustody();
        $byToken = $this->createShipmentInHubCustody();

        $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/reception/validate', ['scan_code' => $byToken->public_token])
            ->assertOk()
            ->assertJsonPath('accepted', true)
            ->assertJsonPath('package.id', $byToken->id);

        $response = $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/reception/confirm', $this->confirmPayload([
                ['scan_code' => $byGuide->tracking_code],
                ['scan_code' => $byVisibleCode->display_code],
                ['scan_code' => 'DHE:'.$byToken->public_token],
            ]), ['Idempotency-Key' => 'all-scan-formats'])
            ->assertOk()
            ->assertJsonPath('summary.accepted_count', 3)
            ->assertJsonPath('summary.rejected_count', 0);

        $this->assertSame(
            [$byGuide->id, $byVisibleCode->id, $byToken->id],
            collect($response->json('accepted'))->pluck('package.id')->all(),
        );
    }

    public function test_driver_cannot_confirm_reception_on_behalf_of_another_driver(): void
    {
        $shipment = $this->createShipmentInHubCustody();

        $payload = $this->confirmPayload([['scan_code' => $shipment->tracking_code]]);
        $payload['driver_id'] = $this->otherDriver->id;

        $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/reception/confirm', $payload, ['Idempotency-Key' => 'forbidden-driver-override'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['driver_id']);

        $this->assertNull($shipment->fresh()->driver_id);
        $this->assertSame(0, CustodyEvent::query()
            ->where('shipment_id', $shipment->id)
            ->where('new_custodian_type', 'driver')
            ->count());
    }

    public function test_confirmation_requires_idempotency_key_and_rejects_key_reuse_with_other_content(): void
    {
        $first = $this->createShipmentInHubCustody();
        $second = $this->createShipmentInHubCustody();

        $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/reception/confirm', $this->confirmPayload([['scan_code' => $first->tracking_code]]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['idempotency_key']);

        $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/reception/confirm', $this->confirmPayload([['scan_code' => $first->tracking_code]]), ['Idempotency-Key' => 'reused-key'])
            ->assertOk();

        $this->actingAs($this->driverUser, 'sanctum')
            ->postJson('/api/driver/reception/confirm', $this->confirmPayload([['scan_code' => $second->tracking_code]]), ['Idempotency-Key' => 'reused-key'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['idempotency_key']);
    }

    private function linkDriverUser(Driver $driver, string $email): User
    {
        $user = User::factory()->create(['email' => $email, 'driver_id' => $driver->id]);
        $driver->update(['user_id' => $user->id]);
        $user->syncRoles([
            Role::query()->where('name', 'driver')->where('guard_name', 'web')->firstOrFail(),
            Role::query()->where('name', 'driver')->where('guard_name', 'sanctum')->firstOrFail(),
        ]);

        return $user;
    }

    private function createShipmentInHubCustody(array $overrides = []): Shipment
    {
        $shipment = $this->createShipment($overrides);
        CustodyEvent::query()->create([
            'shipment_id' => $shipment->id,
            'event_type' => 'received_at_hub',
            'new_custodian_type' => 'hub',
            'new_custodian_id' => 1,
            'new_custodian_name' => 'Sede principal',
            'occurred_at' => now()->subMinute(),
        ]);

        return $shipment;
    }

    private function recordDriverCustody(Shipment $shipment, Driver $driver): void
    {
        CustodyEvent::query()->create([
            'shipment_id' => $shipment->id,
            'event_type' => 'assigned_to_driver',
            'previous_custodian_type' => 'hub',
            'previous_custodian_id' => 1,
            'new_custodian_type' => 'driver',
            'new_custodian_id' => $driver->id,
            'new_custodian_name' => $driver->name,
            'occurred_at' => now(),
        ]);
    }

    private function createShipment(array $overrides = []): Shipment
    {
        $sequence = ((int) Shipment::withTrashed()->max('sequence_number')) + 1;

        return Shipment::withoutEvents(fn () => Shipment::query()->create(array_merge([
            'client_id' => $this->client->id,
            'created_by' => $this->admin->id,
            'tracking_code' => sprintf('REC%014d', $sequence),
            'display_code' => sprintf('#REC%05d', $sequence),
            'public_token' => sprintf('opaque-reception-token-%05d', $sequence),
            'sequence_number' => $sequence,
            'status' => 'in_warehouse',
            'recipient_name' => 'Destinatario Recepción',
            'recipient_phone' => '3000000000',
            'recipient_address' => 'Calle 10 # 20-30',
            'recipient_zone' => 'Kennedy',
            'recipient_city' => 'Bogotá',
            'payment_type' => 'post_sale',
            'shipping_cost' => 12500,
            'cod_amount' => 0,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ], $overrides)));
    }

    /** @param array<int, array<string, mixed>> $packages */
    private function confirmPayload(array $packages): array
    {
        return [
            'device_id' => 'P15-test-device',
            'lat' => 4.6097100,
            'lng' => -74.0817500,
            'occurred_at' => now()->toISOString(),
            'packages' => $packages,
        ];
    }
}
