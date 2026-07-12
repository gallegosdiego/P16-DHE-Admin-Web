<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Operations\Models\ServiceLocation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PickupIntakeApiTest extends TestCase
{
    use RefreshDatabase;

    private string $token;

    private Client $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->client = Client::query()->firstOrFail();

        $response = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ]);
        $this->token = $response->json('token');
    }

    public function test_admin_can_create_a_pickup_at_the_client_location(): void
    {
        $response = $this->postJson('/api/pickup-intakes', array_merge($this->basePayload(), [
            'source' => 'admin',
            'intake_mode' => 'pickup_at_client_location',
            'pickup_address_line1' => 'Carrera 7 # 80-20',
            'pickup_city' => 'Bogotá',
        ]), $this->auth('pickup-client-001'));

        $response->assertCreated()
            ->assertJsonPath('data.intake_mode', 'pickup_at_client_location')
            ->assertJsonPath('data.tasks.0.task_type', 'client_pickup')
            ->assertJsonCount(1, 'data.packages');

        $this->assertDatabaseHas('operational_tasks', [
            'pickup_request_id' => $response->json('data.id'),
            'task_type' => 'client_pickup',
        ]);
    }

    public function test_admin_can_manage_the_service_location_catalog(): void
    {
        $created = $this->postJson('/api/service-locations', [
            'code' => 'HUB-NORTE',
            'name' => 'Sede Norte',
            'address_line1' => 'Calle 170 # 20-30',
            'city' => 'Bogotá',
            'is_active' => true,
        ], $this->auth('unused-location-key'));

        $created->assertCreated()
            ->assertJsonPath('data.code', 'HUB-NORTE')
            ->assertJsonPath('data.is_active', true);

        $this->getJson('/api/service-locations', $this->auth('unused-list-key'))
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Sede Norte');

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'operations.location_created',
            'entity_id' => $created->json('data.id'),
        ]);
    }

    public function test_planned_dropoff_uses_the_selected_hub_without_creating_a_route(): void
    {
        $location = $this->location();
        $response = $this->postJson('/api/pickup-intakes', array_merge($this->basePayload(), [
            'source' => 'client_portal',
            'intake_mode' => 'planned_dropoff_at_hub',
            'service_location_id' => $location->id,
            'planned_dropoff_at' => now()->addDay()->toIso8601String(),
        ]), $this->auth('pickup-dropoff-001'));

        $response->assertCreated()
            ->assertJsonPath('data.service_location_id', $location->id)
            ->assertJsonPath('data.pickup_address_line1', $location->address_line1)
            ->assertJsonPath('data.tasks.0.task_type', 'hub_intake');

        $this->assertDatabaseCount('routes', 0);
        $this->assertDatabaseCount('route_stops', 0);
    }

    public function test_walk_in_creates_an_auditable_request_without_prior_notice(): void
    {
        $location = $this->location();
        $response = $this->postJson('/api/pickup-intakes', array_merge($this->basePayload(), [
            'source' => 'hub_walk_in',
            'intake_mode' => 'walk_in_at_hub',
            'service_location_id' => $location->id,
        ]), $this->auth('pickup-walk-in-001'));

        $response->assertCreated()
            ->assertJsonPath('data.source', 'hub_walk_in')
            ->assertJsonPath('data.pickup_window_code', 'NOW')
            ->assertJsonPath('data.tasks.0.task_type', 'hub_intake');

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'operations.pickup_created',
            'entity_id' => $response->json('data.id'),
        ]);
    }

    public function test_repeated_idempotency_key_returns_the_same_pickup(): void
    {
        $payload = array_merge($this->basePayload(), [
            'source' => 'admin',
            'intake_mode' => 'pickup_at_client_location',
            'pickup_address_line1' => 'Calle 100 # 20-30',
        ]);

        $first = $this->postJson('/api/pickup-intakes', $payload, $this->auth('pickup-retry-001'));
        $second = $this->postJson('/api/pickup-intakes', $payload, $this->auth('pickup-retry-001'));

        $first->assertCreated();
        $second->assertCreated();
        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertDatabaseCount('pickup_requests', 1);
        $this->assertDatabaseCount('operational_tasks', 1);
    }

    public function test_hub_mode_rejects_a_missing_service_location(): void
    {
        $response = $this->postJson('/api/pickup-intakes', array_merge($this->basePayload(), [
            'source' => 'hub_walk_in',
            'intake_mode' => 'walk_in_at_hub',
        ]), $this->auth('pickup-invalid-hub'));

        $response->assertUnprocessable()->assertJsonValidationErrors('service_location_id');
    }

    public function test_client_portal_is_scoped_to_its_own_customer(): void
    {
        $token = $this->clientToken();
        $otherClient = Client::query()->create(['name' => 'Otro cliente']);
        $payload = array_merge($this->basePayload(), [
            'customer_id' => $otherClient->id,
            'source' => 'client_portal',
            'intake_mode' => 'pickup_at_client_location',
            'pickup_address_line1' => 'Calle 1 # 2-3',
        ]);

        $this->postJson('/api/pickup-intakes', $payload, [
            'Authorization' => "Bearer {$token}",
            'Idempotency-Key' => 'foreign-client-attempt',
        ])->assertForbidden();

        $this->assertDatabaseCount('pickup_requests', 0);
    }

    public function test_client_source_is_normalized_and_walk_in_is_staff_only(): void
    {
        $token = $this->clientToken();
        $headers = [
            'Authorization' => "Bearer {$token}",
            'Idempotency-Key' => 'client-own-pickup',
        ];
        $payload = array_merge($this->basePayload(), [
            'source' => 'admin',
            'intake_mode' => 'pickup_at_client_location',
            'pickup_address_line1' => 'Calle 1 # 2-3',
        ]);

        $this->postJson('/api/pickup-intakes', $payload, $headers)
            ->assertCreated()
            ->assertJsonPath('data.source', 'client_portal');

        $walkIn = array_merge($this->basePayload(), [
            'source' => 'hub_walk_in',
            'intake_mode' => 'walk_in_at_hub',
            'service_location_id' => $this->location()->id,
        ]);
        $headers['Idempotency-Key'] = 'client-walk-in-attempt';

        $this->postJson('/api/pickup-intakes', $walkIn, $headers)->assertForbidden();
    }

    /** @return array<string, mixed> */
    private function basePayload(): array
    {
        return [
            'customer_id' => $this->client->id,
            'contact_name' => 'María Cliente',
            'contact_phone' => '3001234567',
            'packages' => [[
                'recipient_name' => 'Carlos Destinatario',
                'recipient_phone' => '3017654321',
                'delivery_address_line1' => 'Calle 50 # 10-15',
                'delivery_city' => 'Bogotá',
                'is_cod' => true,
                'requested_cod_amount' => 15000,
            ]],
        ];
    }

    private function location(): ServiceLocation
    {
        return ServiceLocation::query()->firstOrCreate([
            'code' => 'HUB-CENTRAL',
        ], [
            'name' => 'Sede Central',
            'address_line1' => 'Avenida 1 # 2-3',
            'city' => 'Bogotá',
        ]);
    }

    /** @return array<string, string> */
    private function auth(string $idempotencyKey): array
    {
        return [
            'Authorization' => "Bearer {$this->token}",
            'Idempotency-Key' => $idempotencyKey,
        ];
    }

    private function clientToken(): string
    {
        return (string) $this->postJson('/api/login', [
            'email' => 'maria@tiendamaria.com',
            'password' => 'Cliente2026!',
        ])->json('token');
    }
}
