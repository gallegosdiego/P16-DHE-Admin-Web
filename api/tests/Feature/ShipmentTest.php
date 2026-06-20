<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ShipmentTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
    }

    public function test_can_create_shipment_with_auto_tracking(): void
    {
        $client = Client::create([
            'name' => 'Test Cliente',
            'phone' => '310 000 0000',
            'billing_type' => 'cash_on_delivery',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Juan Prueba',
                'recipient_phone' => '311 111 1111',
                'recipient_address' => 'Cl 100 #20-30',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 50000,
            ]);

        $response->assertCreated()
            ->assertJsonStructure([
                'id', 'tracking_code', 'display_code', 'status',
            ]);

        // Verificar guía generada
        $data = $response->json();
        $this->assertStringStartsWith('DHE', $data['tracking_code']);
        $this->assertStringStartsWith('#DHE', $data['display_code']);
        $this->assertEquals('registered', $data['status']);

        // Verificar evento de creación
        $this->assertDatabaseHas('shipment_events', [
            'shipment_id' => $data['id'],
            'to_status' => 'registered',
        ]);
    }

    public function test_can_create_mercado_libre_shipment_without_cod_amount(): void
    {
        $client = Client::create([
            'name' => 'Cliente Mercado Libre',
            'phone' => '310 000 0001',
            'billing_type' => 'post_sale',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Comprador ML',
                'recipient_phone' => '311 111 1112',
                'recipient_address' => 'Cl 101 #20-30',
                'payment_type' => 'mercado_libre',
                'shipping_cost' => 11500,
                'cod_amount' => 85000,
            ]);

        $response->assertCreated()
            ->assertJsonPath('payment_type', 'mercado_libre')
            ->assertJsonPath('cod_amount', 0);

        $this->assertDatabaseHas('shipments', [
            'id' => $response->json('id'),
            'payment_type' => 'mercado_libre',
            'cod_amount' => 0,
        ]);
    }

    public function test_can_create_shipment_with_intake_photo(): void
    {
        Storage::fake('public');

        $client = Client::create([
            'name' => 'Cliente Foto',
            'phone' => '310 000 0002',
            'billing_type' => 'cash_on_delivery',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->post('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Cliente con foto',
                'recipient_phone' => '311 111 1113',
                'recipient_address' => 'Cl 102 #20-30',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 45000,
                'intake_photo' => UploadedFile::fake()->image('paquete.jpg', 1200, 900)->size(1200),
            ], ['Accept' => 'application/json']);

        $response->assertCreated();

        $path = str_replace('/storage/', '', $response->json('intake_photo'));
        Storage::disk('public')->assertExists($path);
        $this->assertStringStartsWith('/storage/intake/', $response->json('intake_photo'));
    }

    public function test_can_change_shipment_status(): void
    {
        $client = Client::create([
            'name' => 'Test', 'phone' => '310', 'billing_type' => 'cash_on_delivery',
        ]);
        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026051300099',
            'display_code' => '#DHE00099',
            'sequence_number' => 99,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Test', 'recipient_phone' => '311',
            'recipient_address' => 'Cl 1', 'status' => 'registered',
            'payment_type' => 'cash_on_delivery', 'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/status", [
                'status' => 'confirmed',
            ]);

        $response->assertOk()
            ->assertJsonPath('status', 'confirmed');
    }

    public function test_can_delete_registered_shipment_with_delete_method(): void
    {
        $client = Client::create([
            'name' => 'Test', 'phone' => '310', 'billing_type' => 'cash_on_delivery',
        ]);
        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026051300199',
            'display_code' => '#DHE00199',
            'sequence_number' => 199,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Test',
            'recipient_phone' => '311',
            'recipient_address' => 'Cl 1',
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->deleteJson("/api/shipments/{$shipment->id}")
            ->assertOk()
            ->assertJsonStructure(['message']);

        $this->assertSoftDeleted('shipments', ['id' => $shipment->id]);
    }

    public function test_can_delete_registered_shipment_with_post_fallback(): void
    {
        $client = Client::create([
            'name' => 'Test', 'phone' => '310', 'billing_type' => 'cash_on_delivery',
        ]);
        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026051300200',
            'display_code' => '#DHE00200',
            'sequence_number' => 200,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Test',
            'recipient_phone' => '311',
            'recipient_address' => 'Cl 1',
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/delete")
            ->assertOk()
            ->assertJsonStructure(['message']);

        $this->assertSoftDeleted('shipments', ['id' => $shipment->id]);
    }

    public function test_cannot_delete_in_transit_shipment(): void
    {
        $client = Client::create([
            'name' => 'Test', 'phone' => '310', 'billing_type' => 'cash_on_delivery',
        ]);
        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026051300201',
            'display_code' => '#DHE00201',
            'sequence_number' => 201,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Test',
            'recipient_phone' => '311',
            'recipient_address' => 'Cl 1',
            'status' => 'in_transit',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->deleteJson("/api/shipments/{$shipment->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('shipments', ['id' => $shipment->id, 'deleted_at' => null]);
    }

    public function test_invalid_status_transition_returns_error(): void
    {
        $client = Client::create([
            'name' => 'Test', 'phone' => '310', 'billing_type' => 'cash_on_delivery',
        ]);
        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026051300098',
            'display_code' => '#DHE00098',
            'sequence_number' => 98,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Test', 'recipient_phone' => '311',
            'recipient_address' => 'Cl 1', 'status' => 'registered',
            'payment_type' => 'cash_on_delivery', 'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]);

        // registered → delivered no es válido (debe pasar por confirmed, in_transit, etc.)
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/status", [
                'status' => 'delivered',
            ]);

        $response->assertStatus(500); // InvalidArgumentException
    }

    public function test_dashboard_returns_kpis(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/dashboard');

        $response->assertOk()
            ->assertJsonStructure([
                'today' => ['total', 'delivered', 'in_transit', 'issue'],
                'financial' => ['cod_pending', 'today_revenue', 'today_profit'],
                'week' => ['total'],
            ]);
    }

    public function test_dashboard_falls_back_to_latest_activity_when_today_has_no_shipments(): void
    {
        $client = Client::create([
            'name' => 'Cliente Dashboard',
            'phone' => '310 000 0099',
            'billing_type' => 'cash_on_delivery',
        ]);

        $yesterday = now()->subDay();

        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026061900010',
            'display_code' => '#DHE90010',
            'sequence_number' => 90010,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Pedido visible',
            'recipient_phone' => '311 999 0000',
            'recipient_address' => 'Cl 10 #10-10',
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 11500,
            'cod_amount' => 23000,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ]);

        DB::table('shipments')->where('id', $shipment->id)->update([
            'created_at' => $yesterday,
            'updated_at' => $yesterday,
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/dashboard');

        $response->assertOk()
            ->assertJsonPath('today.total', 1)
            ->assertJsonPath('today.registered', 1)
            ->assertJsonPath('today.scope', 'latest_activity')
            ->assertJsonPath('today.scope_date', $yesterday->toDateString())
            ->assertJsonPath('financial.today_revenue', 11500);
    }

    public function test_public_tracking_finds_shipment(): void
    {
        $this->seed(\Database\Seeders\DemoDataSeeder::class);

        $response = $this->getJson('/api/track?code=DHE00001');

        $response->assertOk()
            ->assertJsonPath('found', true)
            ->assertJsonStructure([
                'shipment' => ['tracking_code', 'status', 'status_label'],
                'timeline',
            ]);
    }

    public function test_public_tracking_returns_404_for_invalid_code(): void
    {
        $response = $this->getJson('/api/track?code=INVALID999');

        $response->assertNotFound()
            ->assertJsonPath('found', false);
    }
}
