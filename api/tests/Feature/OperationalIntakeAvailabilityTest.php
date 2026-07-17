<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class OperationalIntakeAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_pickup_routes_return_actionable_service_unavailable_before_querying_missing_tables(): void
    {
        $this->seed();
        $login = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ])->assertOk();
        $headers = ['Authorization' => 'Bearer '.$login->json('token')];

        Schema::disableForeignKeyConstraints();
        Schema::dropIfExists('pickup_requests');
        Schema::enableForeignKeyConstraints();

        $this->getJson('/api/pickup-requests')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'auth_expired');

        $limitedUser = User::factory()->create();
        $limitedToken = $limitedUser->createToken('schema-permission-order')->plainTextToken;

        $this->getJson('/api/pickup-requests', [
            'Authorization' => 'Bearer '.$limitedToken,
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'forbidden')
            ->assertJsonMissingPath('missing_tables');

        // Cada petición HTTP real resuelve el guard desde cero. La aplicación de
        // pruebas comparte proceso, así que se limpia el usuario autenticado para
        // que el siguiente Bearer token sea evaluado de forma independiente.
        $this->app['auth']->forgetGuards();

        foreach ([
            '/api/pickup-requests',
            '/api/pickup-requests/999999',
        ] as $endpoint) {
            $this->getJson($endpoint, $headers)
                ->assertStatus(503)
                ->assertHeader('Retry-After', '60')
                ->assertHeader('X-Error-ID')
                ->assertJsonPath('code', 'operational_intake_unavailable')
                ->assertJsonPath('retryable', true)
                ->assertJsonPath('required_action', 'database_update')
                ->assertJsonPath('missing_tables.0', 'pickup_requests')
                ->assertJsonPath('missing_tables_count', 1)
                ->assertJsonStructure([
                    'error_id',
                    'deployment' => [
                        'status',
                        'commit',
                        'started_at',
                        'completed_at',
                        'failed_at',
                        'phase',
                        'exit_code',
                    ],
                ]);
        }
    }
}
