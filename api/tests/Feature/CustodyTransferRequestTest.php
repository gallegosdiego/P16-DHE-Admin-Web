<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\CustodyReview;
use App\Domain\Shipment\Models\CustodyTransferRequest;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Services\CustodyGuard;
use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Contrato 2026-09-26-B §1: traspaso entre pilotos con aceptación.
 * Si A ya arrancó ruta con el paquete, A debe aceptar; si no, B lo toma ya.
 */
class CustodyTransferRequestTest extends TestCase
{
    use RefreshDatabase;

    private Driver $driverA;

    private Driver $driverB;

    private Driver $driverC;

    private User $pilotA;

    private User $pilotB;

    private User $pilotC;

    private User $admin;

    private int $keys = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolesAndPermissionsSeeder::class, DemoDataSeeder::class]);
        $drivers = Driver::where('status', 'active')->orderBy('id')->take(3)->get()->all();
        $this->assertCount(3, $drivers, 'El seeder demo debe traer tres pilotos activos.');
        [$this->driverA, $this->driverB, $this->driverC] = $drivers;
        $this->pilotA = $this->pilotFor($this->driverA);
        $this->pilotB = $this->pilotFor($this->driverB);
        $this->pilotC = $this->pilotFor($this->driverC);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();
    }

    private function pilotFor(Driver $driver): User
    {
        $user = User::factory()->create(['driver_id' => $driver->id]);
        $user->assignRole('driver');
        $user->assignRole(Role::where('name', 'driver')->where('guard_name', 'sanctum')->firstOrFail());
        $driver->update(['user_id' => $user->id]);

        return $user;
    }

    private function shipment(string $status, Driver $custodian): Shipment
    {
        $n = (int) Shipment::withTrashed()->max('sequence_number') + 1;
        $shipment = Shipment::withoutEvents(fn () => Shipment::create([
            'client_id' => Client::firstOrFail()->id, 'created_by' => $this->admin->id,
            'sequence_number' => $n, 'tracking_code' => "ctr$n", 'display_code' => "#CTR$n",
            'public_token' => "traspaso-token-$n", 'status' => $status,
            'driver_id' => $custodian->id, 'recipient_name' => 'Doña QA', 'recipient_phone' => '3000000000',
            'recipient_address' => 'Calle 1 # 2-3', 'recipient_zone' => 'Kennedy', 'recipient_city' => 'Bogotá',
            'payment_type' => 'prepaid', 'shipping_cost' => 1000,
        ]));
        CustodyEvent::create([
            'shipment_id' => $shipment->id, 'event_type' => 'assigned_to_driver',
            'new_custodian_type' => 'driver', 'new_custodian_id' => $custodian->id, 'new_custodian_name' => $custodian->name,
            'occurred_at' => now()->subMinutes(30),
        ]);

        return $shipment;
    }

    private function routeWith(Driver $driver, string $status, Shipment ...$shipments): Route
    {
        $route = Route::create(['driver_id' => $driver->id, 'route_date' => today(), 'status' => $status,
            'total_stops' => count($shipments), 'completed_stops' => 0]);
        foreach ($shipments as $index => $shipment) {
            RouteStop::create(['route_id' => $route->id, 'shipment_id' => $shipment->id, 'sort_order' => $index + 1, 'status' => 'pending']);
        }

        return $route;
    }

    /** Paquete en la ruta ACTIVA de A (A ya arrancó). */
    private function onActiveRouteOfA(): array
    {
        $shipment = $this->shipment('in_transit', $this->driverA);
        $keep = $this->shipment('in_transit', $this->driverA);
        $route = $this->routeWith($this->driverA, 'active', $shipment, $keep);

        return [$shipment, $route];
    }

    private function take(User $pilot, Shipment $shipment): TestResponse
    {
        return $this->actingAs($pilot, 'sanctum')->postJson('/api/driver/reception/confirm', [
            'device_id' => 'traspaso-test', 'lat' => 4.6, 'lng' => -74.0, 'occurred_at' => now()->toISOString(),
            'packages' => [['scan_code' => $shipment->tracking_code, 'physical_condition' => 'intact']],
        ], ['Idempotency-Key' => 'traspaso-'.(++$this->keys)]);
    }

    private function holder(Shipment $shipment): ?int
    {
        return app(CustodyGuard::class)->holdingDriver($shipment->id)['id'] ?? null;
    }

    private function requestB(): array
    {
        [$shipment, $route] = $this->onActiveRouteOfA();
        $this->take($this->pilotB, $shipment)->assertOk()->assertJsonPath('rejected.0.correlation', 'pending_acceptance');

        return [$shipment, $route, CustodyTransferRequest::firstOrFail()];
    }

    public function test_immediate_transfer_when_a_has_not_started_a_route_with_the_package(): void
    {
        $shipment = $this->shipment('handed_to_driver', $this->driverA);

        $this->actingAs($this->pilotB, 'sanctum')->postJson('/api/driver/reception/validate', ['scan_code' => $shipment->tracking_code])
            ->assertOk()->assertJsonPath('accepted', true)->assertJsonPath('requires_acceptance', false);

        $this->take($this->pilotB, $shipment)->assertOk()
            ->assertJsonPath('summary.accepted_count', 1)
            ->assertJsonPath('summary.pending_count', 0)
            ->assertJsonPath('accepted.0.correlation', 'transferred');

        $this->assertSame($this->driverB->id, $this->holder($shipment));
        $this->assertSame(0, CustodyTransferRequest::count());
    }

    public function test_package_on_as_active_route_creates_a_pending_request_without_moving_custody(): void
    {
        [$shipment, $route] = $this->onActiveRouteOfA();

        $this->actingAs($this->pilotB, 'sanctum')->postJson('/api/driver/reception/validate', ['scan_code' => $shipment->tracking_code])
            ->assertOk()->assertJsonPath('accepted', true)
            ->assertJsonPath('requires_acceptance', true)
            ->assertJsonPath('warning', "Lo tiene {$this->driverA->name} en ruta. Al tomarlo le pediremos que acepte.");

        $response = $this->take($this->pilotB, $shipment)->assertOk()
            ->assertJsonPath('summary.accepted_count', 0)
            ->assertJsonPath('summary.rejected_count', 1)
            ->assertJsonPath('summary.pending_count', 1)
            ->assertJsonPath('rejected.0.accepted', false)
            ->assertJsonPath('rejected.0.correlation', 'pending_acceptance')
            ->assertJsonPath('rejected.0.transfer_request.status', 'pending')
            ->assertJsonPath('rejected.0.previous_driver.id', $this->driverA->id)
            ->assertJsonPath('rejected.0.reason', "Le pedimos a {$this->driverA->name} que acepte. Te avisamos cuando responda.");
        $this->assertNotNull($response->json('rejected.0.transfer_request.expires_at'));

        $request = CustodyTransferRequest::firstOrFail();
        $this->assertSame('pending', $request->status);
        $this->assertSame(30, (int) round($request->requested_at->diffInMinutes($request->expires_at)));
        $this->assertSame($this->driverA->id, $this->holder($shipment));
        $this->assertSame($this->driverA->id, (int) $shipment->fresh()->driver_id);
        $this->assertTrue(RouteStop::where('route_id', $route->id)->where('shipment_id', $shipment->id)->exists());
        $this->assertSame(0, CustodyReview::count());

        $this->assertTrue(Notification::where('user_id', $this->pilotA->id)->where('type', 'custody_transfer_request')->exists());
        $this->assertTrue(Notification::where('type', 'custody_transfer_request')->where('body', "{$this->driverB->name} pide el paquete {$shipment->display_code} que tiene {$this->driverA->name}")->exists());

        $this->actingAs($this->pilotA, 'sanctum')->getJson('/api/driver/custody-transfers')->assertOk()
            ->assertJsonCount(1, 'incoming')->assertJsonCount(0, 'outgoing')
            ->assertJsonPath('incoming.0.id', $request->id)
            ->assertJsonPath('incoming.0.status', 'pending')
            ->assertJsonPath('incoming.0.shipment.display_code', $shipment->display_code)
            ->assertJsonPath('incoming.0.shipment.recipient_name', 'Doña QA')
            ->assertJsonPath('incoming.0.shipment.recipient_address', 'Calle 1 # 2-3')
            ->assertJsonPath('incoming.0.from_driver.id', $this->driverA->id)
            ->assertJsonPath('incoming.0.to_driver.name', $this->driverB->name);

        $this->actingAs($this->pilotB, 'sanctum')->getJson('/api/driver/custody-transfers')->assertOk()
            ->assertJsonCount(0, 'incoming')->assertJsonPath('outgoing.0.status', 'pending');
    }

    public function test_accept_executes_the_transfer_and_is_idempotent(): void
    {
        [$shipment, $route, $request] = $this->requestB();

        $this->actingAs($this->pilotA, 'sanctum')->postJson("/api/driver/custody-transfers/{$request->id}/accept")
            ->assertOk()->assertJsonPath('status', 'accepted')->assertJsonPath('data.status', 'accepted');

        $shipment->refresh();
        $this->assertSame($this->driverB->id, $this->holder($shipment));
        $this->assertSame($this->driverB->id, (int) $shipment->driver_id);
        $this->assertSame('handed_to_driver', $shipment->status->value);
        $this->assertFalse(RouteStop::where('route_id', $route->id)->where('shipment_id', $shipment->id)->exists(), 'Sale de la ruta de A');
        $this->assertSame(1, $route->fresh()->total_stops);
        $this->assertTrue(RouteStop::where('shipment_id', $shipment->id)
            ->whereHas('route', fn ($q) => $q->where('driver_id', $this->driverB->id)->where('status', 'planned'))->exists());

        $custody = CustodyEvent::where('shipment_id', $shipment->id)->where('event_type', 'custody_transferred')->sole();
        $this->assertSame($request->id, $custody->metadata_json['transfer_request_id']);
        $this->assertSame($this->pilotB->id, (int) $custody->actor_user_id);
        $this->assertSame($custody->id, (int) $request->fresh()->custody_event_id);
        $this->assertSame($this->pilotA->id, (int) $request->fresh()->responded_by_user_id);
        $this->assertSame(1, CustodyReview::where('shipment_id', $shipment->id)->where('type', 'custody_transferred')->count());
        $this->assertSame("Paquete {$shipment->display_code} pasó de {$this->driverA->name} a {$this->driverB->name} ({$this->driverA->name} aceptó)",
            Notification::where('type', 'custody_transfer')->latest('id')->firstOrFail()->body);
        $this->assertTrue(Notification::where('user_id', $this->pilotB->id)->where('type', 'custody_transfer_response')->exists());

        // Idempotente: aceptar otra vez no duplica nada.
        $this->actingAs($this->pilotA, 'sanctum')->postJson("/api/driver/custody-transfers/{$request->id}/accept")
            ->assertOk()->assertJsonPath('status', 'accepted');
        $this->assertSame(1, CustodyEvent::where('shipment_id', $shipment->id)->where('event_type', 'custody_transferred')->count());

        $this->actingAs($this->pilotB, 'sanctum')->getJson('/api/driver/custody-transfers')->assertOk()
            ->assertJsonPath('outgoing.0.status', 'accepted');
        $this->actingAs($this->pilotA, 'sanctum')->getJson('/api/driver/custody-transfers')->assertOk()
            ->assertJsonCount(0, 'incoming');

        $timeline = collect($this->actingAs($this->admin, 'sanctum')->getJson("/api/shipments/{$shipment->id}/timeline")->assertOk()->json('data'));
        $requested = $timeline->firstWhere('kind', 'transfer_requested');
        $this->assertSame("{$this->driverB->name} pidió el paquete a {$this->driverA->name}", $requested['title']);
        $this->assertSame("transfer_request:{$request->id}", $requested['id']);
        $transferred = $timeline->firstWhere('kind', 'transferred');
        $this->assertStringContainsString("{$this->driverA->name} aceptó", (string) $transferred['detail']);
    }

    public function test_reject_keeps_the_package_with_a(): void
    {
        [$shipment, $route, $request] = $this->requestB();

        $this->actingAs($this->pilotA, 'sanctum')->postJson("/api/driver/custody-transfers/{$request->id}/reject", ['reason' => 'No me lo han entregado'])
            ->assertOk()->assertJsonPath('status', 'rejected');

        $this->assertSame($this->driverA->id, $this->holder($shipment));
        $this->assertTrue(RouteStop::where('route_id', $route->id)->where('shipment_id', $shipment->id)->exists());
        $this->actingAs($this->pilotB, 'sanctum')->getJson('/api/driver/custody-transfers')->assertOk()
            ->assertJsonPath('outgoing.0.status', 'rejected')
            ->assertJsonPath('outgoing.0.reason', 'No me lo han entregado');
        $this->assertTrue(Notification::where('user_id', $this->pilotB->id)->where('type', 'custody_transfer_response')
            ->where('body', 'like', '%no aceptó%No me lo han entregado%')->exists());

        $entry = collect($this->actingAs($this->admin, 'sanctum')->getJson("/api/shipments/{$shipment->id}/timeline")->json('data'))
            ->firstWhere('kind', 'transfer_rejected');
        $this->assertSame("{$this->driverA->name} no aceptó el cambio", $entry['title']);
        $this->assertSame('Motivo: No me lo han entregado', $entry['detail']);

        // Ya respondida: aceptar después no mueve nada.
        $this->actingAs($this->pilotA, 'sanctum')->postJson("/api/driver/custody-transfers/{$request->id}/accept")->assertStatus(409);
        $this->assertSame($this->driverA->id, $this->holder($shipment));
    }

    public function test_request_expires_after_thirty_minutes(): void
    {
        [$shipment, , $request] = $this->requestB();

        $this->travel(31)->minutes();

        $this->actingAs($this->pilotA, 'sanctum')->getJson('/api/driver/custody-transfers')->assertOk()->assertJsonCount(0, 'incoming');
        $this->actingAs($this->pilotB, 'sanctum')->getJson('/api/driver/custody-transfers')->assertOk()
            ->assertJsonPath('outgoing.0.status', 'expired');
        $this->actingAs($this->pilotA, 'sanctum')->postJson("/api/driver/custody-transfers/{$request->id}/accept")
            ->assertStatus(409)->assertJsonPath('status', 'expired');
        $this->assertSame($this->driverA->id, $this->holder($shipment));

        $timeline = collect($this->actingAs($this->admin, 'sanctum')->getJson("/api/shipments/{$shipment->id}/timeline")->json('data'));
        $this->assertSame('La solicitud venció', $timeline->firstWhere('kind', 'transfer_expired')['title']);

        // B vuelve a escanear: nueva solicitud.
        $this->take($this->pilotB, $shipment)->assertOk()->assertJsonPath('rejected.0.correlation', 'pending_acceptance');
        $this->assertSame(2, CustodyTransferRequest::count());
        $this->assertSame(1, CustodyTransferRequest::where('status', 'pending')->count());
    }

    public function test_second_scanner_is_blocked_while_a_request_is_pending_and_b_rescan_reuses_it(): void
    {
        [$shipment, , $request] = $this->requestB();

        $this->actingAs($this->pilotC, 'sanctum')->postJson('/api/driver/reception/validate', ['scan_code' => $shipment->tracking_code])
            ->assertOk()->assertJsonPath('accepted', false)->assertJsonPath('reason_code', 'transfer_pending')
            ->assertJsonPath('reason', "{$this->driverB->name} ya pidió este paquete a {$this->driverA->name}. Espera a que responda.");
        $this->take($this->pilotC, $shipment)->assertOk()->assertJsonPath('rejected.0.reason_code', 'transfer_pending')
            ->assertJsonPath('summary.pending_count', 0);

        $this->actingAs($this->pilotB, 'sanctum')->postJson('/api/driver/reception/validate', ['scan_code' => $shipment->tracking_code])
            ->assertOk()->assertJsonPath('requires_acceptance', true)->assertJsonPath('transfer_request.id', $request->id);
        $notifications = Notification::where('user_id', $this->pilotA->id)->count();
        $this->take($this->pilotB, $shipment)->assertOk()->assertJsonPath('rejected.0.transfer_request.id', $request->id);

        $this->assertSame(1, CustodyTransferRequest::count());
        $this->assertSame($notifications, Notification::where('user_id', $this->pilotA->id)->count(), 'Reescanear no vuelve a molestar a A');
        $this->assertSame($this->driverA->id, $this->holder($shipment));
    }

    public function test_admin_can_list_approve_and_reject(): void
    {
        [$shipment, $route, $request] = $this->requestB();

        $this->actingAs($this->admin, 'sanctum')->getJson('/api/custody-transfers?status=pending')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $request->id);

        $this->actingAs($this->admin, 'sanctum')->postJson("/api/custody-transfers/{$request->id}/approve")
            ->assertOk()->assertJsonPath('status', 'approved_by_admin');
        $this->assertSame($this->driverB->id, $this->holder($shipment));
        $this->assertFalse(RouteStop::where('route_id', $route->id)->where('shipment_id', $shipment->id)->exists());
        $transferred = collect($this->actingAs($this->admin, 'sanctum')->getJson("/api/shipments/{$shipment->id}/timeline")->json('data'))
            ->firstWhere('kind', 'transferred');
        $this->assertStringContainsString("Aprobado por administración ({$this->admin->name})", (string) $transferred['detail']);

        // Rechazo de administración sobre otra solicitud.
        [$other] = $this->onActiveRouteOfA();
        $this->take($this->pilotC, $other)->assertOk()->assertJsonPath('rejected.0.correlation', 'pending_acceptance');
        $second = CustodyTransferRequest::where('shipment_id', $other->id)->sole();
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/custody-transfers/{$second->id}/reject", ['reason' => 'Revisado'])
            ->assertOk()->assertJsonPath('status', 'rejected');
        $this->assertSame($this->driverA->id, $this->holder($other));
    }

    public function test_accept_after_the_package_was_delivered_cancels_the_request(): void
    {
        [$shipment, , $request] = $this->requestB();

        Shipment::withoutEvents(fn () => $shipment->forceFill(['status' => 'delivered'])->save());
        CustodyEvent::create(['shipment_id' => $shipment->id, 'event_type' => 'delivery_completed',
            'previous_custodian_type' => 'driver', 'previous_custodian_id' => $this->driverA->id,
            'new_custodian_type' => 'recipient', 'new_custodian_name' => 'Doña QA', 'occurred_at' => now()]);

        $this->actingAs($this->pilotA, 'sanctum')->postJson("/api/driver/custody-transfers/{$request->id}/accept")
            ->assertStatus(409)->assertJsonPath('status', 'cancelled')->assertJsonPath('data.status', 'cancelled');

        $this->assertSame('cancelled', $request->fresh()->status);
        $this->assertSame(0, CustodyEvent::where('shipment_id', $shipment->id)->where('event_type', 'custody_transferred')->count());
    }

    public function test_only_a_answers_and_only_admin_approves(): void
    {
        [$shipment, , $request] = $this->requestB();

        $this->actingAs($this->pilotB, 'sanctum')->postJson("/api/driver/custody-transfers/{$request->id}/accept")->assertForbidden();
        $this->actingAs($this->pilotC, 'sanctum')->postJson("/api/driver/custody-transfers/{$request->id}/reject")->assertForbidden();
        $this->actingAs($this->pilotA, 'sanctum')->postJson("/api/custody-transfers/{$request->id}/approve")->assertForbidden();
        $this->actingAs($this->pilotA, 'sanctum')->getJson('/api/custody-transfers')->assertForbidden();
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/driver/custody-transfers/{$request->id}/accept")->assertForbidden();
        $this->actingAs($this->pilotA, 'sanctum')->postJson('/api/driver/custody-transfers/999999/accept')->assertNotFound();

        $this->assertSame('pending', $request->fresh()->status);
        $this->assertSame($this->driverA->id, $this->holder($shipment));
    }
}
