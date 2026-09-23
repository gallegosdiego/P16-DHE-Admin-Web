<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Services\DayCloseService;
use App\Domain\Shipment\Services\ShipmentGeodataService;
use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DriverCustodyIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private Driver $driver;

    private Driver $other;

    private User $pilot;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolesAndPermissionsSeeder::class, DemoDataSeeder::class]);
        [$this->driver, $this->other] = Driver::where('status', 'active')->orderBy('id')->take(2)->get()->all();
        $this->pilot = User::factory()->create(['driver_id' => $this->driver->id]);
        $this->pilot->assignRole('driver');
        $this->driver->update(['user_id' => $this->pilot->id, 'zone' => 'Suba']);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();
    }

    private function shipment(array $attributes = [], ?Driver $custodian = null): Shipment
    {
        $n = (int) Shipment::withTrashed()->max('sequence_number') + 1;
        $s = Shipment::withoutEvents(fn () => Shipment::create(array_merge([
            'client_id' => Client::firstOrFail()->id, 'created_by' => $this->admin->id,
            'sequence_number' => $n, 'tracking_code' => "int$n", 'display_code' => "#INT$n",
            'public_token' => "integrity-token-$n", 'status' => $custodian ? 'handed_to_driver' : 'in_warehouse',
            'driver_id' => $custodian?->id, 'recipient_name' => 'QA custodia', 'recipient_phone' => '3000000000',
            'recipient_address' => 'Calle QA', 'recipient_zone' => 'Kennedy', 'recipient_city' => 'Bogotá',
            'payment_type' => 'prepaid', 'shipping_cost' => 1000,
        ], $attributes)));
        CustodyEvent::create(['shipment_id' => $s->id, 'event_type' => $custodian ? 'assigned_to_driver' : 'received_at_hub',
            'new_custodian_type' => $custodian ? 'driver' : 'hub', 'new_custodian_id' => $custodian?->id,
            'occurred_at' => now()->subMinute()]);

        return $s;
    }

    private function payload(array $codes): array
    {
        return ['device_id' => 'integrity-test', 'lat' => 4.6, 'lng' => -74.0, 'occurred_at' => now()->toISOString(),
            'packages' => array_map(fn ($code) => ['scan_code' => $code], $codes)];
    }

    private function take(array $codes, string $key = 'take')
    {
        return $this->actingAs($this->pilot, 'sanctum')->postJson('/api/driver/reception/confirm', $this->payload($codes), ['Idempotency-Key' => $key]);
    }

    public function test_assignment_and_locality_are_information_in_both_validation_and_confirmation(): void
    {
        $s = $this->shipment(['driver_id' => $this->other->id, 'status' => 'assigned_to_route']);
        $this->actingAs($this->pilot, 'sanctum')->postJson('/api/driver/reception/validate', ['scan_code' => $s->tracking_code])
            ->assertOk()->assertJsonPath('accepted', true)->assertJsonPath('package.recipient_zone', 'Kennedy');
        $this->take([$s->tracking_code])->assertOk()->assertJsonPath('summary.accepted_count', 1);
        $this->assertSame($this->driver->id, $s->fresh()->driver_id);
        $this->assertDatabaseHas('custody_reviews', ['shipment_id' => $s->id, 'previous_driver_id' => $this->other->id]);
    }

    public function test_real_driver_transfer_works_when_status_is_already_handed_to_driver(): void
    {
        $s = $this->shipment([], $this->other);
        $this->actingAs($this->pilot, 'sanctum')->postJson('/api/driver/reception/validate', ['scan_code' => $s->tracking_code])
            ->assertOk()->assertJsonPath('accepted', true);
        $this->take([$s->tracking_code])->assertOk()->assertJsonPath('accepted.0.correlation', 'transferred');
        $this->assertDatabaseHas('custody_events', ['shipment_id' => $s->id, 'previous_custodian_id' => $this->other->id, 'new_custodian_id' => $this->driver->id]);
    }

    public function test_duplicate_formats_count_one_physical_package_and_one_custody_event(): void
    {
        $s = $this->shipment();
        $this->take([$s->tracking_code, $s->display_code, 'DHE:'.$s->public_token])->assertOk()
            ->assertJsonPath('summary.accepted_count', 1)->assertJsonPath('summary.rejected_count', 2)
            ->assertJsonPath('rejected.0.reason_code', 'duplicate_package');
        $this->assertSame(2, $s->custodyEvents()->count());
    }

    public function test_terminal_package_on_open_route_is_not_reaccepted(): void
    {
        $s = $this->shipment(['status' => 'delivered']);
        $route = Route::create(['driver_id' => $this->driver->id, 'route_date' => today(), 'status' => 'planned']);
        RouteStop::create(['route_id' => $route->id, 'shipment_id' => $s->id, 'sort_order' => 1, 'status' => 'pending']);
        $this->take([$s->tracking_code])->assertOk()->assertJsonPath('rejected.0.reason_code', 'already_delivered');
        $this->assertSame(1, $s->custodyEvents()->count());
    }

    public function test_return_replay_rejects_a_changed_body_and_keeps_partial_results(): void
    {
        $s = $this->shipment([], $this->driver);
        $foreign = $this->shipment([], $this->other);
        $payload = $this->payload([$s->tracking_code, $foreign->tracking_code]);
        $first = $this->actingAs($this->pilot, 'sanctum')->postJson('/api/driver/returns', $payload, ['Idempotency-Key' => 'return'])
            ->assertOk()->assertJsonPath('summary.accepted_count', 1)->assertJsonPath('summary.rejected_count', 1);
        $this->postJson('/api/driver/returns', $payload, ['Idempotency-Key' => 'return'])->assertExactJson($first->json());
        $this->postJson('/api/driver/returns', $this->payload([$foreign->tracking_code]), ['Idempotency-Key' => 'return'])->assertStatus(422);
        $this->assertNull($s->fresh()->driver_id);
        $this->assertSame($this->other->id, $foreign->fresh()->driver_id);
    }

    public function test_late_hub_confirmation_cannot_steal_custody_after_a_package_is_taken_again(): void
    {
        $s = $this->shipment([], $this->driver);
        $this->actingAs($this->pilot, 'sanctum')->postJson('/api/driver/returns', $this->payload([$s->tracking_code]), ['Idempotency-Key' => 'return'])->assertOk();
        $this->take([$s->tracking_code])->assertOk()->assertJsonPath('summary.accepted_count', 1);
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/shipments/return-confirmations', ['scan_code' => $s->tracking_code])
            ->assertOk()->assertJsonPath('confirmed', false)->assertJsonPath('reason_code', 'custody_changed');
        $this->assertSame('driver', $s->custodyEvents()->latest('id')->first()->new_custodian_type);
    }

    public function test_device_time_is_evidence_but_cannot_backdate_current_custody(): void
    {
        $s = $this->shipment();
        $payload = $this->payload([$s->tracking_code]);
        $payload['occurred_at'] = now()->subDays(2)->toISOString();
        $payload['lat'] = $payload['lng'] = null;
        $this->actingAs($this->pilot, 'sanctum')->postJson('/api/driver/reception/confirm', $payload, ['Idempotency-Key' => 'clock'])
            ->assertOk()->assertJsonPath('summary.accepted_count', 1);
        $event = $s->custodyEvents()->latest('occurred_at')->latest('id')->first();
        $this->assertSame('driver', $event->new_custodian_type);
        $this->assertSame($payload['occurred_at'], $event->metadata_json['device_occurred_at']);
        $this->assertNull($event->lat);
    }

    public function test_panel_counts_returns_and_then_counts_retake_as_current_custody(): void
    {
        $s = $this->shipment();
        $this->take([$s->tracking_code])->assertOk();
        $this->postJson('/api/driver/returns/validate', ['scan_code' => $s->tracking_code])->assertOk()->assertJsonPath('accepted', true);
        $this->postJson('/api/driver/returns', $this->payload([$s->tracking_code]), ['Idempotency-Key' => 'return'])->assertOk();
        $this->getJson('/api/driver/my-route')->assertOk();
        $summary = app(DayCloseService::class)->summary(today()->toDateString());
        $row = collect($summary['drivers'])->firstWhere('driver_id', $this->driver->id);
        $this->assertSame(1, $row['counts']['returned_to_warehouse']);
        $this->assertSame(0, $row['counts']['on_motorcycle']);
        $this->take([$s->tracking_code], 'take-again')->assertOk();
        $summary = app(DayCloseService::class)->summary(today()->toDateString());
        $row = collect($summary['drivers'])->firstWhere('driver_id', $this->driver->id);
        $this->assertSame(1, $row['counts']['on_motorcycle']);
    }

    public function test_batch_of_23_is_partial_and_terminal_packages_do_not_block_the_others(): void
    {
        $codes = [];
        for ($i = 0; $i < 23; $i++) {
            $codes[] = $this->shipment()->tracking_code;
        }
        $terminal = $this->shipment(['status' => 'cancelled']);
        $this->take([...$codes, $terminal->tracking_code])->assertOk()
            ->assertJsonPath('summary.accepted_count', 23)->assertJsonPath('summary.rejected_count', 1);
        $this->assertSame(23, CustodyEvent::where('new_custodian_type', 'driver')->where('new_custodian_id', $this->driver->id)->count());
    }

    public function test_custody_changes_do_not_call_geodata_repair_when_the_address_is_unchanged(): void
    {
        $s = $this->shipment();
        $this->mock(ShipmentGeodataService::class)->shouldNotReceive('repair');
        $this->take([$s->tracking_code])->assertOk()->assertJsonPath('summary.accepted_count', 1);
        $this->postJson('/api/driver/returns', $this->payload([$s->tracking_code]), ['Idempotency-Key' => 'return'])->assertOk()
            ->assertJsonPath('summary.accepted_count', 1);
    }
}
