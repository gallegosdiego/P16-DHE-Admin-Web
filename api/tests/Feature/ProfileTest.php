<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
    }

    public function test_can_update_profile(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->putJson('/api/me', [
                'name' => 'Ángel Actualizado',
                'phone' => '300 111 2222',
            ]);

        $response->assertOk()
            ->assertJsonPath('name', 'Ángel Actualizado')
            ->assertJsonPath('phone', '300 111 2222')
            ->assertJsonPath('message', 'Perfil actualizado.');
    }

    public function test_cannot_update_email_via_profile(): void
    {
        // email no está en las reglas de validación, debe ignorarse
        $response = $this->actingAs($this->admin, 'sanctum')
            ->putJson('/api/me', [
                'name' => 'Test',
                'email' => 'hacker@evil.com',
            ]);

        $response->assertOk();

        // Email no debe cambiar
        $this->assertEquals('admin@danheiexpress.com', $this->admin->fresh()->email);
    }

    public function test_can_change_password(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->putJson('/api/me/password', [
                'current_password' => 'DanheiAdmin2026!',
                'password' => 'NuevaPass2026!',
                'password_confirmation' => 'NuevaPass2026!',
            ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Contraseña actualizada.');

        // Verificar que la nueva contraseña funciona
        $this->assertTrue(Hash::check('NuevaPass2026!', $this->admin->fresh()->password));
    }

    public function test_cannot_change_password_with_wrong_current(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->putJson('/api/me/password', [
                'current_password' => 'WrongPassword!',
                'password' => 'NuevaPass2026!',
                'password_confirmation' => 'NuevaPass2026!',
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
    }

    public function test_password_must_be_confirmed(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->putJson('/api/me/password', [
                'current_password' => 'DanheiAdmin2026!',
                'password' => 'NuevaPass2026!',
                'password_confirmation' => 'Diferente123!',
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors('password');
    }

    public function test_dashboard_hourly_returns_data(): void
    {
        $this->seed(\Database\Seeders\DemoDataSeeder::class);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/dashboard/hourly');

        $response->assertOk()
            ->assertJsonStructure([
                'registrations' => [['hour', 'label', 'count']],
                'deliveries',
                'peak_hour',
            ]);
    }

    public function test_batch_assign_works(): void
    {
        $this->seed(\Database\Seeders\DemoDataSeeder::class);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments/batch-assign', [
                'shipment_ids' => [1, 2],
                'driver_id' => 1,
            ]);

        $response->assertOk()
            ->assertJsonPath('updated', 2)
            ->assertJsonStructure(['updated', 'message']);
    }

    public function test_demo_users_exist(): void
    {
        // Verificar los 3 usuarios demo
        $this->assertDatabaseHas('users', ['email' => 'admin@danheiexpress.com']);
        $this->assertDatabaseHas('users', ['email' => 'sandra@danheiexpress.com']);
        $this->assertDatabaseHas('users', ['email' => 'operador@danheiexpress.com']);

        // Verificar roles
        $sandra = User::where('email', 'sandra@danheiexpress.com')->first();
        $this->assertTrue($sandra->hasRole('administrador'));

        $operador = User::where('email', 'operador@danheiexpress.com')->first();
        $this->assertTrue($operador->hasRole('operador'));
    }

    public function test_rate_limiting_on_login(): void
    {
        // Enviar 6 intentos rápidos (límite es 5 por minuto)
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', [
                'email' => 'invalid@test.com',
                'password' => 'wrong',
            ]);
        }

        $response = $this->postJson('/api/login', [
            'email' => 'invalid@test.com',
            'password' => 'wrong',
        ]);

        $response->assertStatus(429); // Too Many Requests
    }
}
