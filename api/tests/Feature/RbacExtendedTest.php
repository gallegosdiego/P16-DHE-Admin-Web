<?php

namespace Tests\Feature;

use App\Domain\Driver\Models\Driver;
use App\Domain\Shared\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class RbacExtendedTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function loginAs(string $email, string $password): string
    {
        $response = $this->postJson('/api/login', [
            'email' => $email,
            'password' => $password,
        ]);
        return $response->json('token');
    }

    private function authHeader(string $token): array
    {
        return ['Authorization' => "Bearer {$token}"];
    }

    // ── Unauthenticated ──────────────────────────

    public function test_unauthenticated_gets_401_on_protected_routes(): void
    {
        $routes = [
            '/api/shipments',
            '/api/clients',
            '/api/drivers',
            '/api/financial/overview',
            '/api/zones',
            '/api/routes',
            '/api/notifications',
            '/api/users',
        ];

        foreach ($routes as $route) {
            $this->getJson($route)->assertUnauthorized();
        }
    }

    // ── Operador restrictions ────────────────────

    public function test_operador_can_view_shipments(): void
    {
        $token = $this->loginAs('operador@danheiexpress.com', 'Danhei2026!');

        $response = $this->getJson('/api/shipments', $this->authHeader($token));
        $response->assertOk();
    }

    public function test_operador_can_view_dashboard(): void
    {
        $token = $this->loginAs('operador@danheiexpress.com', 'Danhei2026!');

        $response = $this->getJson('/api/dashboard', $this->authHeader($token));
        $response->assertOk();
    }

    public function test_operador_cannot_access_users_crud(): void
    {
        $token = $this->loginAs('operador@danheiexpress.com', 'Danhei2026!');

        $this->getJson('/api/users', $this->authHeader($token))
            ->assertForbidden();
    }

    public function test_operador_cannot_create_users(): void
    {
        $token = $this->loginAs('operador@danheiexpress.com', 'Danhei2026!');

        $this->postJson('/api/users', [
            'name' => 'Intruder',
            'email' => 'intruder@test.com',
            'password' => 'Test1234!',
            'role' => 'admin',
        ], $this->authHeader($token))->assertForbidden();
    }

    public function test_operador_cannot_settle_financial(): void
    {
        $token = $this->loginAs('operador@danheiexpress.com', 'Danhei2026!');

        $shipment = \App\Domain\Shipment\Models\Shipment::first();

        $this->postJson(
            "/api/financial/shipments/{$shipment->id}/settle",
            [],
            $this->authHeader($token)
        )->assertForbidden();
    }

    // ── Admin capabilities ───────────────────────

    public function test_admin_can_view_users(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');

        $response = $this->getJson('/api/users', $this->authHeader($token));
        $response->assertOk();
    }

    public function test_admin_can_create_users(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');

        $response = $this->postJson('/api/users', [
            'name' => 'Nuevo Operador',
            'email' => 'nuevo@danheiexpress.com',
            'password' => 'NuevoPass2026!',
            'role' => 'operador',
        ], $this->authHeader($token));

        $response->assertCreated();
    }

    public function test_admin_cannot_create_driver_user_without_driver_id(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');

        $this->postJson('/api/users', [
            'name' => 'Piloto Sin Vinculo',
            'email' => 'piloto.sin.vinculo@danheiexpress.com',
            'password' => 'Piloto2026!',
            'role' => 'driver',
        ], $this->authHeader($token))->assertUnprocessable();
    }

    public function test_admin_can_create_driver_user_with_driver_link(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');
        $driver = Driver::create([
            'name' => 'Piloto Usuario',
            'initials' => 'PU',
            'phone' => '3007770000',
            'vehicle' => 'Moto',
            'plate' => 'USR001',
            'zone' => 'Centro',
            'status' => 'active',
            'per_package_rate' => 3000,
        ]);

        $response = $this->postJson('/api/users', [
            'name' => 'Piloto Usuario',
            'email' => 'piloto.usuario@danheiexpress.com',
            'password' => 'Piloto2026!',
            'role' => 'driver',
            'driver_id' => $driver->id,
        ], $this->authHeader($token));

        $response->assertCreated()
            ->assertJsonPath('driver_id', $driver->id);

        $user = User::where('email', 'piloto.usuario@danheiexpress.com')->firstOrFail();
        $this->assertSame($user->id, $driver->fresh()->user_id);

        $driverLogin = $this->postJson('/api/login', [
            'email' => 'piloto.usuario@danheiexpress.com',
            'password' => 'Piloto2026!',
        ]);
        $driverLogin->assertOk()
            ->assertJsonPath('user.driver_id', $driver->id);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/driver/assigned-shipments')
            ->assertOk();
    }

    public function test_admin_can_create_driver_with_mobile_access(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');

        $response = $this->postJson('/api/drivers', [
            'name' => 'Piloto Nuevo QA',
            'phone' => '3201112233',
            'email' => 'piloto.nuevo.qa@danheiexpress.com',
            'password' => 'Piloto2026!',
            'vehicle' => 'Moto',
            'plate' => 'QA123D',
            'zone' => 'Centro',
            'per_package_rate' => 3500,
        ], $this->authHeader($token));

        $response->assertCreated()
            ->assertJsonPath('name', 'Piloto Nuevo QA')
            ->assertJsonPath('phone', '3201112233')
            ->assertJsonPath('user.email', 'piloto.nuevo.qa@danheiexpress.com');

        $driver = Driver::where('name', 'Piloto Nuevo QA')->firstOrFail();
        $user = User::where('email', 'piloto.nuevo.qa@danheiexpress.com')->firstOrFail();

        $this->assertSame($driver->id, $user->driver_id);
        $this->assertSame($user->id, $driver->fresh()->user_id);
    }

    public function test_admin_cannot_create_driver_without_phone(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');

        $this->postJson('/api/drivers', [
            'name' => 'Piloto Sin Telefono',
            'phone' => '',
            'email' => 'piloto.sin.telefono@danheiexpress.com',
            'password' => 'Piloto2026!',
        ], $this->authHeader($token))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['phone']);
    }

    public function test_admin_can_view_audit_logs(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');

        $response = $this->getJson('/api/audit-logs', $this->authHeader($token));
        $response->assertOk();
    }

    public function test_audit_logs_are_filterable_and_expose_value_changes(): void
    {
        $admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();
        $this->actingAs($admin, 'sanctum');

        AuditLog::log(
            'financial.settle',
            null,
            ['status' => 'pending'],
            ['status' => 'settled', 'shipment_ids' => [11, 12]],
            'Liquidacion de prueba',
        );

        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');
        $today = now()->toDateString();

        $response = $this->getJson(
            "/api/audit-logs?search=Liquidacion&action=financial.settle&date_from={$today}&date_to={$today}",
            $this->authHeader($token),
        );

        $response
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.action', 'financial.settle')
            ->assertJsonPath('data.0.old_values.status', 'pending')
            ->assertJsonPath('data.0.new_values.status', 'settled')
            ->assertJsonPath('data.0.new_values.shipment_ids.0', 11);
    }

    public function test_admin_can_access_financial_overview(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');

        $response = $this->getJson('/api/financial/overview', $this->authHeader($token));
        $response->assertOk();
    }

    // ── Invalid login ────────────────────────────

    public function test_admin_can_create_app_access_for_legacy_driver(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');
        $driver = Driver::create([
            'name' => 'Piloto Legacy',
            'initials' => 'PL',
            'phone' => '3009990000',
            'vehicle' => 'Moto',
            'plate' => 'LEG001',
            'zone' => 'Centro',
            'status' => 'active',
            'per_package_rate' => 3000,
        ]);

        $response = $this->putJson("/api/drivers/{$driver->id}", [
            'email' => 'piloto.legacy@danheiexpress.com',
            'password' => 'Legacy2026!',
        ], $this->authHeader($token));

        $response->assertOk()
            ->assertJsonPath('user.email', 'piloto.legacy@danheiexpress.com');

        $user = User::where('email', 'piloto.legacy@danheiexpress.com')->firstOrFail();
        $this->assertSame($driver->id, $user->driver_id);
        $this->assertTrue(Hash::check('Legacy2026!', $user->password));
        $this->assertTrue($user->hasRole('driver'));
        $this->assertDatabaseHas('model_has_roles', [
            'role_id' => Role::where('name', 'driver')->where('guard_name', 'web')->value('id'),
            'model_id' => $user->id,
        ]);
        $this->assertDatabaseHas('model_has_roles', [
            'role_id' => Role::where('name', 'driver')->where('guard_name', 'sanctum')->value('id'),
            'model_id' => $user->id,
        ]);
        $this->assertSame($user->id, $driver->fresh()->user_id);
    }

    public function test_admin_can_create_app_access_with_form_post_fallback(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');
        $driver = Driver::create([
            'name' => 'Piloto Form Post',
            'initials' => 'PF',
            'phone' => '3004440000',
            'vehicle' => 'Moto',
            'plate' => 'POS001',
            'zone' => 'Centro',
            'status' => 'active',
            'per_package_rate' => 3000,
        ]);

        $response = $this->postJson("/api/drivers/{$driver->id}", [
            'email' => 'piloto.formpost@danheiexpress.com',
            'password' => 'FormPost2026!',
        ], $this->authHeader($token));

        $response->assertOk()
            ->assertJsonPath('user.email', 'piloto.formpost@danheiexpress.com');

        $user = User::where('email', 'piloto.formpost@danheiexpress.com')->firstOrFail();
        $this->assertSame($driver->id, $user->driver_id);
        $this->assertSame($user->id, $driver->fresh()->user_id);
    }

    public function test_driver_profile_update_syncs_linked_user(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');
        $driver = Driver::create([
            'name' => 'Piloto Original',
            'initials' => 'PO',
            'phone' => '3007770000',
            'vehicle' => 'Moto',
            'plate' => 'ORI001',
            'zone' => 'Centro',
            'status' => 'active',
            'per_package_rate' => 3000,
        ]);
        $user = User::create([
            'name' => 'Piloto Original',
            'email' => 'piloto.original@danheiexpress.com',
            'phone' => '3007770000',
            'password' => Hash::make('Original2026!'),
            'driver_id' => $driver->id,
        ]);
        $driver->update(['user_id' => $user->id]);

        $this->putJson("/api/drivers/{$driver->id}", [
            'name' => 'Piloto Actualizado',
            'phone' => '3007771111',
        ], $this->authHeader($token))->assertOk();

        $user->refresh();
        $this->assertSame('Piloto Actualizado', $user->name);
        $this->assertSame('3007771111', $user->phone);
        $this->assertSame('PA', $driver->fresh()->initials);
    }

    public function test_driver_update_repairs_user_driver_id_link(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');
        $driver = Driver::create([
            'name' => 'Piloto User Link',
            'initials' => 'UL',
            'phone' => '3003330000',
            'vehicle' => 'Moto',
            'plate' => 'ULK001',
            'zone' => 'Centro',
            'status' => 'active',
            'per_package_rate' => 3000,
        ]);
        $user = User::create([
            'name' => 'Piloto User Link',
            'email' => 'piloto.userlink@danheiexpress.com',
            'phone' => '3003330000',
            'password' => Hash::make('UserLink2026!'),
        ]);
        $driver->update(['user_id' => $user->id]);

        $this->putJson("/api/drivers/{$driver->id}", [
            'email' => 'piloto.userlink.updated@danheiexpress.com',
        ], $this->authHeader($token))
            ->assertOk()
            ->assertJsonPath('user.email', 'piloto.userlink.updated@danheiexpress.com');

        $user->refresh();
        $this->assertSame($driver->id, $user->driver_id);
    }

    public function test_legacy_driver_access_requires_password(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');
        $driver = Driver::create([
            'name' => 'Piloto Sin Acceso',
            'initials' => 'PS',
            'phone' => '3008880000',
            'vehicle' => 'Moto',
            'plate' => 'SIN001',
            'zone' => 'Centro',
            'status' => 'active',
            'per_package_rate' => 3000,
        ]);

        $this->putJson("/api/drivers/{$driver->id}", [
            'email' => 'piloto.sinacceso@danheiexpress.com',
        ], $this->authHeader($token))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');
    }

    public function test_legacy_driver_id_link_exposes_access_email(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');
        $driver = Driver::create([
            'name' => 'Piloto Link Antiguo',
            'initials' => 'LA',
            'phone' => '3006660000',
            'vehicle' => 'Moto',
            'plate' => 'LIN001',
            'zone' => 'Centro',
            'status' => 'active',
            'per_package_rate' => 3000,
        ]);
        User::create([
            'name' => 'Piloto Link Antiguo',
            'email' => 'piloto.link@danheiexpress.com',
            'phone' => '3006660000',
            'password' => Hash::make('Link2026!'),
            'driver_id' => $driver->id,
        ]);

        $listResponse = $this->getJson('/api/drivers', $this->authHeader($token));
        $listResponse->assertOk();
        $row = collect($listResponse->json())->firstWhere('id', $driver->id);
        $this->assertSame('piloto.link@danheiexpress.com', $row['user']['email'] ?? null);

        $this->getJson("/api/drivers/{$driver->id}", $this->authHeader($token))
            ->assertOk()
            ->assertJsonPath('user.email', 'piloto.link@danheiexpress.com');
    }

    public function test_delete_and_restore_resolves_user_id_only_link(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');
        $driver = Driver::create([
            'name' => 'Piloto User Id',
            'initials' => 'PU',
            'phone' => '3005550000',
            'vehicle' => 'Moto',
            'plate' => 'UID001',
            'zone' => 'Centro',
            'status' => 'active',
            'per_package_rate' => 3000,
        ]);
        $user = User::create([
            'name' => 'Piloto User Id',
            'email' => 'piloto.userid@danheiexpress.com',
            'phone' => '3005550000',
            'password' => Hash::make('UserId2026!'),
        ]);
        $driver->update(['user_id' => $user->id]);

        $this->deleteJson("/api/drivers/{$driver->id}", [], $this->authHeader($token))->assertOk();
        $this->assertSoftDeleted('drivers', ['id' => $driver->id]);
        $this->assertSoftDeleted('users', ['id' => $user->id]);

        $this->postJson("/api/drivers/{$driver->id}/restore", [], $this->authHeader($token))->assertOk();
        $this->assertNotSoftDeleted('drivers', ['id' => $driver->id]);
        $this->assertNotSoftDeleted('users', ['id' => $user->id]);
        $this->assertSame($driver->id, $user->fresh()->driver_id);
    }

    public function test_admin_can_delete_driver_with_form_post_fallback(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');
        $driver = Driver::create([
            'name' => 'Piloto Delete Post',
            'initials' => 'DP',
            'phone' => '3002220000',
            'vehicle' => 'Moto',
            'plate' => 'DEL001',
            'zone' => 'Centro',
            'status' => 'active',
            'per_package_rate' => 3000,
        ]);
        $user = User::create([
            'name' => 'Piloto Delete Post',
            'email' => 'piloto.deletepost@danheiexpress.com',
            'phone' => '3002220000',
            'password' => Hash::make('DeletePost2026!'),
            'driver_id' => $driver->id,
        ]);
        $driver->update(['user_id' => $user->id]);

        $this->postJson("/api/drivers/{$driver->id}/delete", [], $this->authHeader($token))->assertOk();

        $this->assertSoftDeleted('drivers', ['id' => $driver->id]);
        $this->assertSoftDeleted('users', ['id' => $user->id]);
    }

    public function test_invalid_credentials_rejected(): void
    {
        $response = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'WrongPassword!',
        ]);

        $response->assertUnprocessable();
    }

    public function test_nonexistent_user_rejected(): void
    {
        $response = $this->postJson('/api/login', [
            'email' => 'ghost@danheiexpress.com',
            'password' => 'Whatever!',
        ]);

        $response->assertUnprocessable();
    }
}
