<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shared\Models\Notification;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\DeliveryAttempt;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Models\ShipmentEvent;
use App\Domain\Shipment\Models\ShipmentEvidence;
use App\Domain\Shipment\Services\DayCloseService;
use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Contrato 2026-09-26: historial unificado, varias fotos por entrega, fotos
 * agregadas después, custodia entre pilotos y devoluciones de novedades.
 */
class TrazabilidadFotosCustodiaTest extends TestCase
{
    use RefreshDatabase;

    private Driver $driverA;

    private Driver $driverB;

    private User $pilotA;

    private User $pilotB;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->seed([RolesAndPermissionsSeeder::class, DemoDataSeeder::class]);
        [$this->driverA, $this->driverB] = Driver::where('status', 'active')->orderBy('id')->take(2)->get()->all();
        $this->pilotA = $this->pilotFor($this->driverA);
        $this->pilotB = $this->pilotFor($this->driverB);
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

    private function shipment(array $attributes = [], ?Driver $custodian = null): Shipment
    {
        $n = (int) Shipment::withTrashed()->max('sequence_number') + 1;
        $shipment = Shipment::withoutEvents(fn () => Shipment::create(array_merge([
            'client_id' => Client::firstOrFail()->id, 'created_by' => $this->admin->id,
            'sequence_number' => $n, 'tracking_code' => "trz$n", 'display_code' => "#TRZ$n",
            'public_token' => "trazabilidad-token-$n", 'status' => $custodian ? 'handed_to_driver' : 'in_warehouse',
            'driver_id' => $custodian?->id, 'recipient_name' => 'QA trazabilidad', 'recipient_phone' => '3000000000',
            'recipient_address' => 'Calle QA', 'recipient_zone' => 'Kennedy', 'recipient_city' => 'Bogotá',
            'payment_type' => 'prepaid', 'shipping_cost' => 1000,
        ], $attributes)));
        CustodyEvent::create([
            'shipment_id' => $shipment->id,
            'event_type' => $custodian ? 'assigned_to_driver' : 'received_at_hub',
            'new_custodian_type' => $custodian ? 'driver' : 'hub',
            'new_custodian_id' => $custodian?->id,
            'new_custodian_name' => $custodian?->name,
            'occurred_at' => now()->subMinutes(30),
        ]);

        return $shipment;
    }

    private function routeWith(Driver $driver, string $status, Shipment ...$shipments): Route
    {
        $route = Route::create([
            'driver_id' => $driver->id, 'route_date' => today(), 'status' => $status,
            'total_stops' => count($shipments), 'completed_stops' => 0,
        ]);
        foreach ($shipments as $index => $shipment) {
            RouteStop::create(['route_id' => $route->id, 'shipment_id' => $shipment->id, 'sort_order' => $index + 1, 'status' => 'pending']);
        }

        return $route;
    }

    private function receptionPayload(array $codes): array
    {
        return ['device_id' => 'trazabilidad-test', 'lat' => 4.6, 'lng' => -74.0, 'occurred_at' => now()->toISOString(),
            'packages' => array_map(fn ($code) => ['scan_code' => $code], $codes)];
    }

    private function photo(string $name, int $width = 40, int $height = 40): UploadedFile
    {
        // Tamaños distintos = contenido distinto (la deduplicación es por sha256).
        return UploadedFile::fake()->image($name, $width, $height);
    }

    // ── §1 Historial unificado ────────────────────────────────────────────

    public function test_timeline_merges_sources_in_order_dedupes_and_names_the_transfer(): void
    {
        $shipment = $this->shipment();
        ShipmentEvent::create(['shipment_id' => $shipment->id, 'from_status' => null, 'to_status' => 'registered',
            'description' => 'Envío creado', 'occurred_at' => now()->subHour()]);

        // A lo recibe por escaneo; B se lo quita con el paquete en la mano.
        $this->actingAs($this->pilotA, 'sanctum')->postJson('/api/driver/reception/confirm', $this->receptionPayload([$shipment->tracking_code]), ['Idempotency-Key' => 'a-take'])
            ->assertOk()->assertJsonPath('summary.accepted_count', 1);
        $this->travel(5)->minutes();
        $this->actingAs($this->pilotB, 'sanctum')->postJson('/api/driver/reception/confirm', $this->receptionPayload([$shipment->tracking_code]), ['Idempotency-Key' => 'b-take'])
            ->assertOk()->assertJsonPath('accepted.0.correlation', 'transferred');

        // B reporta novedad con dos fotos.
        $this->travel(5)->minutes();
        $route = Route::where('driver_id', $this->driverB->id)->firstOrFail();
        $stop = RouteStop::where('route_id', $route->id)->where('shipment_id', $shipment->id)->firstOrFail();
        $this->actingAs($this->pilotB, 'sanctum')->post("/api/routes/{$route->id}/stops/{$stop->id}/resolve", [
            'status' => 'issue',
            'issue_note' => 'Nadie en casa',
            'evidence_photos' => [$this->photo('a.jpg', 30, 30), $this->photo('b.jpg', 31, 31)],
        ], ['Accept' => 'application/json'])->assertOk();

        $this->travel(5)->minutes();
        $this->actingAs($this->pilotB, 'sanctum')->post("/api/shipments/{$shipment->id}/evidence", [
            'photos' => [$this->photo('late.jpg', 32, 32)],
            'note' => 'Foto de la portería',
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->travel(1)->minutes();
        AuditLog::create(['user_id' => $this->admin->id, 'action' => 'financial.collect', 'entity_type' => 'Shipment',
            'entity_id' => $shipment->id, 'description' => 'COD recaudado', 'occurred_at' => now()]);

        $data = $this->actingAs($this->admin, 'sanctum')->getJson("/api/shipments/{$shipment->id}/timeline")
            ->assertOk()->json('data');

        $kinds = array_column($data, 'kind');
        $ids = array_column($data, 'id');
        $this->assertSame(count($ids), count(array_unique($ids)), 'Los ids deben ser únicos');
        $times = array_map(fn ($entry) => strtotime($entry['at']), $data);
        $sorted = $times;
        sort($sorted);
        $this->assertSame($sorted, $times, 'Orden cronológico ascendente');

        $this->assertSame('created', $kinds[0]);
        // El estado "Entregado al piloto" coincide con la custodia: sale una sola vez.
        $this->assertSame(1, count(array_keys($kinds, 'handed_to_driver')));
        $this->assertStringStartsWith('custody:', collect($data)->firstWhere('kind', 'handed_to_driver')['id']);
        $this->assertSame("Entregado a {$this->driverA->name}", collect($data)->firstWhere('kind', 'handed_to_driver')['title']);

        $transfer = collect($data)->firstWhere('kind', 'transferred');
        $this->assertNotNull($transfer);
        $this->assertStringStartsWith('custody:', $transfer['id']);
        $this->assertSame($this->driverA->name, $transfer['from']);
        $this->assertSame($this->driverB->name, $transfer['to']);
        $this->assertSame("Pasó de {$this->driverA->name} a {$this->driverB->name}", $transfer['title']);

        $failed = collect($data)->where('kind', 'delivery_failed')->values();
        $this->assertCount(1, $failed, 'La novedad sale una vez (intento), no también como estado ni custodia');
        $this->assertSame('No se pudo entregar: Nadie en casa', $failed[0]['title']);
        $this->assertCount(2, $failed[0]['photos']);
        $this->assertSame('issue_photo', $failed[0]['photos'][0]['type']);
        $this->assertNotEmpty($failed[0]['photos'][0]['url']);

        $late = collect($data)->firstWhere('kind', 'photo_added');
        $this->assertSame('Foto agregada', $late['title']);
        $this->assertSame('Foto de la portería', $late['detail']);
        $this->assertSame('late_photo', $late['photos'][0]['type']);

        $this->assertSame('cod_collected', end($kinds));
        $this->assertMatchesRegularExpression('/-05:00$/', $data[0]['at']);
    }

    public function test_shipment_detail_exposes_evidence_urls(): void
    {
        $shipment = $this->shipment([], $this->driverA);
        ShipmentEvidence::create(['shipment_id' => $shipment->id, 'evidence_type' => 'delivery_photo', 'original_path' => 'evidence/x.jpg',
            'sha256' => str_repeat('a', 64), 'received_at' => now()]);

        $url = $this->actingAs($this->admin, 'sanctum')->getJson("/api/shipments/{$shipment->id}")
            ->assertOk()->json('evidence.0.url');

        $this->assertStringEndsWith('/storage/evidence/x.jpg', $url);
    }

    // ── §2 Varias fotos por entrega ───────────────────────────────────────

    public function test_resolve_delivered_stores_every_photo_on_the_new_attempt(): void
    {
        $shipment = $this->shipment(['status' => 'in_transit'], $this->driverA);
        $route = $this->routeWith($this->driverA, 'active', $shipment);
        $stop = $route->stops()->firstOrFail();

        $response = $this->actingAs($this->pilotA, 'sanctum')->post("/api/routes/{$route->id}/stops/{$stop->id}/resolve", [
            'status' => 'delivered',
            'evidence_receiver_name' => 'Portero',
            'evidence_photos' => [$this->photo('1.jpg', 20, 20), $this->photo('2.png', 21, 21)],
            'evidence_photo' => $this->photo('legacy.jpg', 22, 22),
        ], ['Accept' => 'application/json'])->assertOk();

        // La app ve las fotos en la parada y el custodio anterior.
        $response->assertJsonCount(3, 'route.stops.0.shipment.evidence')
            ->assertJsonPath('route.stops.0.shipment.evidence.0.evidence_type', 'delivery_photo')
            ->assertJsonStructure(['route' => ['stops' => [['shipment' => ['evidence' => [['id', 'url', 'evidence_type', 'captured_at']], 'custody' => ['previous_custodian_name']]]]]]);

        $attempt = DeliveryAttempt::where('shipment_id', $shipment->id)->sole();
        $rows = ShipmentEvidence::where('delivery_attempt_id', $attempt->id)->orderBy('id')->get();
        $this->assertCount(3, $rows);
        $this->assertSame(['delivery_photo'], $rows->pluck('evidence_type')->unique()->values()->all());
        $this->assertSame($rows->first()->original_path, $shipment->fresh()->getRawOriginal('evidence_photo'));
        $rows->each(fn ($row) => Storage::disk('public')->assertExists($row->original_path));
    }

    public function test_novedad_accepts_photos_and_never_inherits_the_stale_column(): void
    {
        $shipment = $this->shipment(['status' => 'in_transit', 'evidence_photo' => 'evidence/foto-vieja.jpg'], $this->driverA);
        $route = $this->routeWith($this->driverA, 'active', $shipment);
        $stop = $route->stops()->firstOrFail();

        $this->actingAs($this->pilotA, 'sanctum')->postJson("/api/routes/{$route->id}/stops/{$stop->id}/resolve", [
            'status' => 'issue', 'issue_note' => 'Dirección errada',
        ])->assertOk();

        $attempt = DeliveryAttempt::where('shipment_id', $shipment->id)->sole();
        $this->assertSame(0, ShipmentEvidence::where('delivery_attempt_id', $attempt->id)->count(), 'Ya no se copia la foto vieja');

        // Segundo paquete: novedad con foto → issue_photo en el intento nuevo.
        $other = $this->shipment(['status' => 'in_transit'], $this->driverA);
        $otherStop = RouteStop::create(['route_id' => $route->id, 'shipment_id' => $other->id, 'sort_order' => 2, 'status' => 'pending']);
        $route->update(['status' => 'active']);
        $this->actingAs($this->pilotA, 'sanctum')->post("/api/routes/{$route->id}/stops/{$otherStop->id}/resolve", [
            'status' => 'issue', 'evidence_photos' => [$this->photo('n.jpg', 25, 25)],
        ], ['Accept' => 'application/json'])->assertOk();

        $this->assertSame('issue_photo', ShipmentEvidence::where('shipment_id', $other->id)->sole()->evidence_type);
    }

    public function test_more_than_six_photos_is_rejected_in_spanish_and_nothing_is_written(): void
    {
        $shipment = $this->shipment(['status' => 'in_transit'], $this->driverA);
        $route = $this->routeWith($this->driverA, 'active', $shipment);
        $stop = $route->stops()->firstOrFail();
        $photos = [];
        for ($i = 0; $i < 7; $i++) {
            $photos[] = $this->photo("p$i.jpg", 10 + $i, 10 + $i);
        }

        $this->actingAs($this->pilotA, 'sanctum')->post("/api/routes/{$route->id}/stops/{$stop->id}/resolve", [
            'status' => 'delivered', 'evidence_photos' => $photos,
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonPath('errors.evidence_photos.0', 'Puedes enviar máximo 6 fotos.');

        $this->assertSame(0, ShipmentEvidence::count());
        $this->assertSame([], Storage::disk('public')->allFiles('evidence'));
    }

    public function test_failed_transition_discards_uploaded_files(): void
    {
        // Contra entrega en $0: la entrega se rechaza y la foto no debe quedar en disco.
        $shipment = $this->shipment(['status' => 'in_transit', 'payment_type' => 'cash_on_delivery', 'cod_amount' => 0], $this->driverA);
        $route = $this->routeWith($this->driverA, 'active', $shipment);
        $stop = $route->stops()->firstOrFail();

        $this->actingAs($this->pilotA, 'sanctum')->post("/api/routes/{$route->id}/stops/{$stop->id}/resolve", [
            'status' => 'delivered', 'evidence_photos' => [$this->photo('x.jpg')],
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->assertSame([], Storage::disk('public')->allFiles('evidence'));
        $this->assertSame(0, ShipmentEvidence::count());
    }

    public function test_legacy_status_endpoint_accepts_several_photos(): void
    {
        $shipment = $this->shipment(['status' => 'in_transit'], $this->driverA);

        $this->actingAs($this->pilotA, 'sanctum')->post("/api/shipments/{$shipment->id}/status", [
            'status' => 'delivered',
            'evidence_photos' => [$this->photo('1.jpg', 20, 20), $this->photo('2.jpg', 21, 21)],
        ], ['Accept' => 'application/json'])->assertOk();

        $attempt = DeliveryAttempt::where('shipment_id', $shipment->id)->sole();
        $this->assertSame(2, ShipmentEvidence::where('delivery_attempt_id', $attempt->id)->where('evidence_type', 'delivery_photo')->count());
        $this->assertNotNull($shipment->fresh()->getRawOriginal('evidence_photo'));
    }

    // ── §3 Fotos agregadas después ────────────────────────────────────────

    private function failedAttemptFor(Driver $driver): Shipment
    {
        $shipment = $this->shipment(['status' => 'issue'], $driver);
        DeliveryAttempt::create(['shipment_id' => $shipment->id, 'driver_id' => $driver->id, 'attempt_number' => 1,
            'status' => 'not_delivered', 'result_code' => 'issue_reported', 'finished_at' => now()]);

        return $shipment;
    }

    public function test_attempt_driver_can_add_late_photos_through_both_routes(): void
    {
        $shipment = $this->failedAttemptFor($this->driverA);

        $response = $this->actingAs($this->pilotA, 'sanctum')->post("/api/driver/shipments/{$shipment->id}/evidence", [
            'photos' => [$this->photo('l1.jpg', 20, 20), $this->photo('l2.jpg', 21, 21)],
        ], ['Accept' => 'application/json'])->assertCreated();

        $response->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.evidence_type', 'late_photo')
            ->assertJsonStructure(['data' => [['id', 'url', 'evidence_type', 'captured_at']]]);
        $this->assertSame($this->pilotA->id, ShipmentEvidence::first()->created_by);

        $this->actingAs($this->pilotA, 'sanctum')->post("/api/shipments/{$shipment->id}/evidence", [
            'photos' => [$this->photo('l3.jpg', 22, 22)],
        ], ['Accept' => 'application/json'])->assertCreated();
        $this->assertSame(3, ShipmentEvidence::where('evidence_type', 'late_photo')->count());
    }

    public function test_another_pilot_cannot_add_late_photos(): void
    {
        $shipment = $this->failedAttemptFor($this->driverA);

        $this->actingAs($this->pilotB, 'sanctum')->post("/api/shipments/{$shipment->id}/evidence", [
            'photos' => [$this->photo('x.jpg')],
        ], ['Accept' => 'application/json'])->assertForbidden()
            ->assertJsonPath('message', 'Solo el piloto que intentó la entrega o quien tiene el paquete puede agregarle fotos.');
        $this->assertSame(0, ShipmentEvidence::count());
    }

    public function test_pilot_window_closes_after_72_hours_but_admin_can_still_add(): void
    {
        $shipment = $this->failedAttemptFor($this->driverA);
        $this->travel(73)->hours();

        $this->actingAs($this->pilotA, 'sanctum')->post("/api/shipments/{$shipment->id}/evidence", [
            'photos' => [$this->photo('x.jpg')],
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonPath('code', 'late_photo_window_closed');

        $this->actingAs($this->admin, 'sanctum')->post("/api/shipments/{$shipment->id}/evidence", [
            'photos' => [$this->photo('y.jpg')], 'note' => 'Cargada por oficina',
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.0.evidence_type', 'late_photo');

        $this->actingAs($this->admin, 'sanctum')->post("/api/shipments/{$shipment->id}/evidence", [], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('errors.photos.0', 'Agrega al menos una foto.');
    }

    // ── §4 Custodia entre pilotos ─────────────────────────────────────────

    // Contrato 2026-09-26-B §1: si A NO arrancó ruta con el paquete, B lo toma
    // de una vez. (Con ruta activa se pide aceptación: CustodyTransferRequestTest.)
    public function test_pilot_takes_a_package_from_another_pilots_active_route(): void
    {
        $shipment = $this->shipment(['status' => 'handed_to_driver'], $this->driverA);
        $keep = $this->shipment(['status' => 'handed_to_driver'], $this->driverA);
        $routeA = $this->routeWith($this->driverA, 'planned', $shipment, $keep);

        $this->actingAs($this->pilotB, 'sanctum')->postJson('/api/driver/reception/validate', ['scan_code' => $shipment->tracking_code])
            ->assertOk()->assertJsonPath('accepted', true)
            ->assertJsonPath('previous_driver.id', $this->driverA->id)
            ->assertJsonPath('previous_driver.name', $this->driverA->name)
            ->assertJsonPath('warning', "Está con {$this->driverA->name}. Confirma solo si lo tienes físicamente; pasará a tu cargo y administración recibirá el cambio.");

        $this->actingAs($this->pilotB, 'sanctum')->postJson('/api/driver/reception/confirm', $this->receptionPayload([$shipment->tracking_code]), ['Idempotency-Key' => 'take-active'])
            ->assertOk()
            ->assertJsonPath('summary.accepted_count', 1)
            ->assertJsonPath('accepted.0.correlation', 'transferred')
            ->assertJsonPath('accepted.0.previous_driver.name', $this->driverA->name);

        $shipment->refresh();
        $this->assertSame($this->driverB->id, $shipment->driver_id);
        $this->assertSame('handed_to_driver', $shipment->status->value);
        $this->assertFalse(RouteStop::where('route_id', $routeA->id)->where('shipment_id', $shipment->id)->exists(), 'La parada sale de la ruta de A');
        $this->assertSame(1, $routeA->fresh()->total_stops);
        $this->assertSame('planned', $routeA->fresh()->status);
        $this->assertDatabaseHas('custody_events', ['shipment_id' => $shipment->id, 'event_type' => 'custody_transferred',
            'previous_custodian_id' => $this->driverA->id, 'new_custodian_id' => $this->driverB->id]);

        $notification = Notification::where('type', 'custody_transfer')->latest('id')->firstOrFail();
        $this->assertSame("Paquete {$shipment->display_code} pasó de {$this->driverA->name} a {$this->driverB->name}", $notification->body);
    }

    public function test_admin_cannot_move_a_package_a_pilot_holds_by_any_non_scan_path(): void
    {
        $shipment = $this->shipment([], $this->driverA);
        $message = "Este paquete lo tiene {$this->driverA->name}. Solo cambia de piloto cuando otro piloto lo escanea.";
        $routeB = Route::create(['driver_id' => $this->driverB->id, 'route_date' => today(), 'status' => 'planned', 'total_stops' => 0, 'completed_stops' => 0]);
        $this->actingAs($this->admin, 'sanctum');

        $this->putJson("/api/shipments/{$shipment->id}", ['driver_id' => $this->driverB->id])
            ->assertStatus(422)->assertJsonPath('errors.driver_id.0', $message);
        $this->postJson("/api/shipments/{$shipment->id}/assign", ['driver_id' => null])
            ->assertStatus(422)->assertJsonPath('errors.driver_id.0', $message);
        $this->postJson("/api/shipments/{$shipment->id}/assign", ['driver_id' => $this->driverB->id])
            ->assertStatus(422)->assertJsonPath('errors.driver_id.0', $message);
        $this->postJson("/api/routes/{$routeB->id}/add-stop", ['shipment_id' => $shipment->id])
            ->assertStatus(422)->assertJsonPath('errors.shipment_id.0', $message);

        // Aunque el envío figure sin piloto, la custodia manda.
        Shipment::whereKey($shipment->id)->update(['driver_id' => null]);
        $this->postJson('/api/routes', ['driver_id' => $this->driverB->id, 'shipment_ids' => [$shipment->id]])
            ->assertStatus(422)->assertJsonPath('errors.shipment_ids.0', $message);
        $this->postJson('/api/routes/dispatch-proposals/apply', [
            'proposals' => [['driver_id' => $this->driverB->id, 'shipment_ids' => [$shipment->id]]],
        ], ['Idempotency-Key' => 'dispatch-custody'])->assertOk()
            ->assertJsonPath('unassigned.0.shipment_id', $shipment->id)
            ->assertJsonPath('unassigned.0.reason', $message)
            ->assertJsonPath('totals.shipments_assigned', 0);

        $this->assertSame(0, RouteStop::where('shipment_id', $shipment->id)->count());
        $latest = CustodyEvent::where('shipment_id', $shipment->id)->latest('id')->first();
        $this->assertSame($this->driverA->id, (int) $latest->new_custodian_id);
    }

    public function test_admin_paths_still_work_while_the_package_is_in_the_hub(): void
    {
        $shipment = $this->shipment();
        $this->actingAs($this->admin, 'sanctum');

        $this->putJson("/api/shipments/{$shipment->id}", ['driver_id' => $this->driverB->id])->assertOk();
        $this->postJson("/api/shipments/{$shipment->id}/assign", ['driver_id' => null])->assertOk();
        $this->postJson("/api/shipments/{$shipment->id}/assign", ['driver_id' => $this->driverA->id])->assertOk();
        $this->postJson('/api/routes', ['driver_id' => $this->driverA->id, 'shipment_ids' => [$shipment->id]])->assertCreated();

        $other = $this->shipment();
        $routeB = Route::create(['driver_id' => $this->driverB->id, 'route_date' => today()->addDay(), 'status' => 'planned', 'total_stops' => 0, 'completed_stops' => 0]);
        $this->postJson("/api/routes/{$routeB->id}/add-stop", ['shipment_id' => $other->id])->assertOk();
    }

    public function test_pilot_can_still_build_a_smart_route_with_packages_in_his_own_custody(): void
    {
        $shipment = $this->shipment([], $this->driverA);

        $this->actingAs($this->pilotA, 'sanctum')->postJson('/api/driver/smart-route', ['shipment_ids' => [$shipment->id]])
            ->assertCreated();
        $this->assertTrue(RouteStop::where('shipment_id', $shipment->id)->exists());
    }

    // ── §5 Devoluciones y cierre del día ──────────────────────────────────

    public function test_novedad_then_pilot_return_then_day_is_settled(): void
    {
        $shipment = $this->shipment(['status' => 'in_transit'], $this->driverA);
        $route = $this->routeWith($this->driverA, 'active', $shipment);
        $stop = $route->stops()->firstOrFail();

        $this->actingAs($this->pilotA, 'sanctum')->postJson("/api/routes/{$route->id}/stops/{$stop->id}/resolve", [
            'status' => 'issue', 'issue_note' => 'Cliente no contesta',
        ])->assertOk();
        $this->assertSame('issue', $shipment->fresh()->status->value);

        $row = collect(app(DayCloseService::class)->summary(today()->toDateString())['drivers'])->firstWhere('driver_id', $this->driverA->id);
        $this->assertSame(1, $row['counts']['on_motorcycle']);
        $this->assertFalse($row['day_settled']);

        $this->postJson('/api/driver/returns/validate', ['scan_code' => $shipment->tracking_code])->assertOk()->assertJsonPath('accepted', true);
        $this->postJson('/api/driver/returns', $this->receptionPayload([$shipment->tracking_code]), ['Idempotency-Key' => 'return-issue'])
            ->assertOk()->assertJsonPath('summary.accepted_count', 1);

        $this->assertSame('in_warehouse', $shipment->fresh()->status->value);
        $row = collect(app(DayCloseService::class)->summary(today()->toDateString())['drivers'])->firstWhere('driver_id', $this->driverA->id);
        $this->assertSame(0, $row['counts']['on_motorcycle']);
        $this->assertSame(1, $row['counts']['returned_to_warehouse']);
        $this->assertTrue($row['day_settled']);
    }

    public function test_admin_day_close_returns_an_issue_package_and_reports_rejections(): void
    {
        $issue = $this->shipment(['status' => 'issue'], $this->driverA);
        $inHub = $this->shipment(['driver_id' => $this->driverA->id]);

        $response = $this->actingAs($this->admin, 'sanctum')->postJson('/api/shipments/warehouse-returns', [
            'shipment_ids' => [$issue->id, $inHub->id],
        ], ['Idempotency-Key' => 'day-close-issue'])->assertOk();

        $response->assertJsonPath('received.0.shipment_id', $issue->id)
            ->assertJsonPath('rejected.0.id', $inHub->id)
            ->assertJsonPath('rejected.0.reason', 'not_driver_custody')
            ->assertJsonPath('rejected.0.message', 'El paquete no está bajo custodia del piloto.');
        $this->assertSame('in_warehouse', $issue->fresh()->status->value);
        $this->assertNull($issue->fresh()->driver_id);
    }

    public function test_remove_stop_keeps_the_package_with_the_pilot_and_leaves_a_trace(): void
    {
        $shipment = $this->shipment(['status' => 'assigned_to_route'], $this->driverA);
        $route = $this->routeWith($this->driverA, 'planned', $shipment);
        $stop = $route->stops()->firstOrFail();

        $this->actingAs($this->admin, 'sanctum')->deleteJson("/api/routes/{$route->id}/stops/{$stop->id}")->assertOk();

        $shipment->refresh();
        $this->assertSame('handed_to_driver', $shipment->status->value);
        $this->assertSame($this->driverA->id, $shipment->driver_id);
        $latest = CustodyEvent::where('shipment_id', $shipment->id)->latest('id')->first();
        $this->assertSame('driver', $latest->new_custodian_type);
        $this->assertSame($this->driverA->id, (int) $latest->new_custodian_id);

        $titles = array_column($this->getJson("/api/shipments/{$shipment->id}/timeline")->assertOk()->json('data'), 'title');
        $this->assertContains('Retirado de la ruta', $titles);
    }

    public function test_remove_stop_of_a_package_still_in_the_hub_leaves_it_in_the_warehouse(): void
    {
        $shipment = $this->shipment(['status' => 'assigned_to_route', 'driver_id' => $this->driverA->id]);
        $route = $this->routeWith($this->driverA, 'planned', $shipment);
        $stop = $route->stops()->firstOrFail();

        $this->actingAs($this->admin, 'sanctum')->deleteJson("/api/routes/{$route->id}/stops/{$stop->id}")->assertOk();

        $this->assertSame('in_warehouse', $shipment->fresh()->status->value);
    }
}
