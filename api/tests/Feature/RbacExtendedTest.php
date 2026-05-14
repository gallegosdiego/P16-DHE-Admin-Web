<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    public function test_admin_can_view_audit_logs(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');

        $response = $this->getJson('/api/audit-logs', $this->authHeader($token));
        $response->assertOk();
    }

    public function test_admin_can_access_financial_overview(): void
    {
        $token = $this->loginAs('admin@danheiexpress.com', 'DanheiAdmin2026!');

        $response = $this->getJson('/api/financial/overview', $this->authHeader($token));
        $response->assertOk();
    }

    // ── Invalid login ────────────────────────────

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
