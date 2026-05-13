<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
    }

    public function test_health_check_returns_ok(): void
    {
        $response = $this->getJson('/api/health');

        $response->assertOk()
            ->assertJson([
                'status' => 'ok',
                'app' => 'Danhei Express API',
            ]);
    }

    public function test_login_with_valid_credentials(): void
    {
        $response = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ]);

        $response->assertOk()
            ->assertJsonStructure([
                'user' => ['id', 'name', 'email', 'roles'],
                'token',
            ])
            ->assertJsonPath('user.email', 'admin@danheiexpress.com')
            ->assertJsonPath('user.roles.0', 'superadmin');
    }

    public function test_login_with_invalid_credentials(): void
    {
        $response = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(422);
    }

    public function test_me_returns_user_when_authenticated(): void
    {
        $user = User::where('email', 'admin@danheiexpress.com')->first();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/me');

        $response->assertOk()
            ->assertJsonPath('email', 'admin@danheiexpress.com');
    }

    public function test_me_returns_401_when_unauthenticated(): void
    {
        $response = $this->getJson('/api/me');

        $response->assertUnauthorized();
    }

    public function test_logout_revokes_token(): void
    {
        $user = User::where('email', 'admin@danheiexpress.com')->first();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('/api/logout');

        $response->assertOk()
            ->assertJson(['message' => 'Sesión cerrada.']);

        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $user->id,
            'name' => 'test',
        ]);
    }
}
