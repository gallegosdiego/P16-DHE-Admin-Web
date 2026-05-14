<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShipmentEdgeCaseTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
        $response = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ]);
        $this->token = $response->json('token');
    }

    private function auth(): array
    {
        return ['Authorization' => "Bearer {$this->token}"];
    }

    // ── Validación de creación ───────────────────

    public function test_cannot_create_shipment_without_client(): void
    {
        $response = $this->postJson('/api/shipments', [
            'recipient_name' => 'Test',
            'recipient_phone' => '300 000 0000',
            'recipient_address' => 'Cl 1 #1-1',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
        ], $this->auth());

        $response->assertUnprocessable();
    }

    public function test_cannot_create_shipment_without_recipient(): void
    {
        $client = Client::first();

        $response = $this->postJson('/api/shipments', [
            'client_id' => $client->id,
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
        ], $this->auth());

        $response->assertUnprocessable();
    }

    public function test_create_shipment_generates_tracking_code(): void
    {
        $client = Client::first();

        $response = $this->postJson('/api/shipments', [
            'client_id' => $client->id,
            'recipient_name' => 'Test Recipient',
            'recipient_phone' => '300 111 2222',
            'recipient_address' => 'Cl 100 #15-20',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 12000,
            'cod_amount' => 50000,
        ], $this->auth());

        $response->assertCreated();
        $this->assertStringStartsWith('DHE', $response->json('tracking_code'));
        $this->assertStringStartsWith('#DHE', $response->json('display_code'));
        $this->assertEquals('registered', $response->json('status'));
    }

    // ── Cambio de estado ─────────────────────────

    public function test_cannot_change_to_invalid_status(): void
    {
        $shipment = Shipment::where('status', 'registered')->first();

        $response = $this->postJson("/api/shipments/{$shipment->id}/status", [
            'status' => 'nonexistent_status',
        ], $this->auth());

        // ShipmentStatus::from() lanzará excepción → 500 o 422
        $this->assertTrue(
            $response->status() >= 400,
            'Debería rechazar un status inválido'
        );
    }

    public function test_status_change_creates_event(): void
    {
        $shipment = Shipment::where('status', 'registered')->first();

        $this->postJson("/api/shipments/{$shipment->id}/status", [
            'status' => 'confirmed',
            'description' => 'Confirmado por test',
        ], $this->auth())->assertOk();

        $this->assertDatabaseHas('shipment_events', [
            'shipment_id' => $shipment->id,
            'to_status' => 'confirmed',
        ]);
    }

    // ── Búsqueda y filtros ──────────────────────

    public function test_search_by_tracking_code(): void
    {
        $shipment = Shipment::first();

        $response = $this->getJson(
            "/api/shipments?search={$shipment->tracking_code}",
            $this->auth()
        );

        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, count($response->json('data')));
    }

    public function test_search_by_recipient_name(): void
    {
        $shipment = Shipment::first();
        $name = substr($shipment->recipient_name, 0, 5);

        $response = $this->getJson(
            "/api/shipments?search={$name}",
            $this->auth()
        );

        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, count($response->json('data')));
    }

    public function test_filter_by_status(): void
    {
        $response = $this->getJson('/api/shipments?status=delivered', $this->auth());
        $response->assertOk();

        foreach ($response->json('data') as $shipment) {
            $this->assertEquals('delivered', $shipment['status']);
        }
    }

    public function test_filter_by_payment_type(): void
    {
        $response = $this->getJson('/api/shipments?payment_type=post_sale', $this->auth());
        $response->assertOk();

        foreach ($response->json('data') as $shipment) {
            $this->assertEquals('post_sale', $shipment['payment_type']);
        }
    }

    public function test_filter_by_date_range(): void
    {
        $from = now()->subDays(30)->toDateString();
        $to = now()->toDateString();

        $response = $this->getJson(
            "/api/shipments?date_from={$from}&date_to={$to}",
            $this->auth()
        );

        $response->assertOk();
    }

    public function test_pagination_works(): void
    {
        $response = $this->getJson('/api/shipments?per_page=2', $this->auth());
        $response->assertOk();
        $response->assertJsonStructure([
            'data',
            'current_page',
            'last_page',
            'per_page',
            'total',
        ]);
        $this->assertLessThanOrEqual(2, count($response->json('data')));
    }

    // ── Batch operations ─────────────────────────

    public function test_batch_assign_updates_all_shipments(): void
    {
        $shipments = Shipment::take(3)->pluck('id')->toArray();
        $driverId = \App\Domain\Driver\Models\Driver::where('status', 'active')->first()->id;

        $response = $this->postJson('/api/shipments/batch-assign', [
            'shipment_ids' => $shipments,
            'driver_id' => $driverId,
        ], $this->auth());

        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, $response->json('updated'));

        // Verificar en BD
        foreach ($shipments as $id) {
            $this->assertDatabaseHas('shipments', [
                'id' => $id,
                'driver_id' => $driverId,
            ]);
        }
    }

    public function test_batch_status_handles_mixed_results(): void
    {
        // Un envío delivered no debería poder volver a registered (transición inválida)
        $delivered = Shipment::where('status', 'delivered')->first();
        $registered = Shipment::where('status', 'registered')->first();

        if (! $delivered || ! $registered) {
            $this->markTestSkipped('Necesita envíos en distintos estados');
        }

        $response = $this->postJson('/api/shipments/batch-status', [
            'shipment_ids' => [$registered->id, $delivered->id],
            'status' => 'confirmed',
        ], $this->auth());

        $response->assertOk();
        // Al menos uno debe haber tenido éxito
        $this->assertGreaterThanOrEqual(1, $response->json('success'));
    }

    // ── Detalle de envío ─────────────────────────

    public function test_show_shipment_includes_events(): void
    {
        $shipment = Shipment::has('events')->first();

        if (! $shipment) {
            $this->markTestSkipped('No hay envíos con eventos');
        }

        $response = $this->getJson("/api/shipments/{$shipment->id}", $this->auth());
        $response->assertOk();
        $response->assertJsonStructure([
            'id', 'tracking_code', 'status', 'events',
        ]);
        $this->assertGreaterThanOrEqual(1, count($response->json('events')));
    }

    public function test_show_shipment_includes_client_and_driver(): void
    {
        $shipment = Shipment::whereNotNull('driver_id')->first();

        $response = $this->getJson("/api/shipments/{$shipment->id}", $this->auth());
        $response->assertOk();
        $this->assertNotNull($response->json('client'));
        $this->assertNotNull($response->json('driver'));
    }

    // ── Dashboard ────────────────────────────────

    public function test_dashboard_returns_correct_structure(): void
    {
        $response = $this->getJson('/api/dashboard', $this->auth());
        $response->assertOk();
        $response->assertJsonStructure([
            'today' => ['total', 'registered', 'delivered', 'issue'],
            'financial' => ['cod_pending', 'today_revenue', 'today_profit'],
            'week' => ['total'],
        ]);
    }

    public function test_hourly_stats_returns_15_hours(): void
    {
        $response = $this->getJson('/api/dashboard/hourly', $this->auth());
        $response->assertOk();
        $response->assertJsonStructure([
            'registrations',
            'deliveries',
            'peak_hour',
        ]);
        // 6:00 a 20:00 = 15 horas
        $this->assertCount(15, $response->json('registrations'));
        $this->assertCount(15, $response->json('deliveries'));
    }
}
