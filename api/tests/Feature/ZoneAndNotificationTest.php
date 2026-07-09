<?php

namespace Tests\Feature;

use App\Domain\Driver\Models\Driver;
use App\Domain\Shared\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ZoneAndNotificationTest extends TestCase
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

    // ── Zonas ──────────────────────────────────────

    public function test_list_zones(): void
    {
        $response = $this->getJson('/api/zones', $this->auth());
        $response->assertOk();

        $zones = $response->json();
        $this->assertGreaterThanOrEqual(8, count($zones));

        // Verificar que Bogotá Centro está
        $bogota = collect($zones)->firstWhere('name', 'Bogotá Centro');
        $this->assertNotNull($bogota);
        $this->assertEquals('urban', $bogota['type']);
        $this->assertEquals(10000, $bogota['base_price']);
    }

    public function test_list_active_zones_only(): void
    {
        $response = $this->getJson('/api/zones?active=1', $this->auth());
        $response->assertOk();

        $zones = $response->json();
        // "Ruta al Llano" está inactiva
        $llano = collect($zones)->firstWhere('slug', 'ruta-al-llano');
        $this->assertNull($llano);
    }

    public function test_create_zone(): void
    {
        $response = $this->postJson('/api/zones', [
            'name' => 'Fontibón',
            'city' => 'Bogotá',
            'type' => 'urban',
            'description' => 'Zona occidental de Bogotá, cerca al aeropuerto.',
        ], $this->auth());

        $response->assertCreated();
        $this->assertEquals('fontibon', $response->json('slug'));
    }

    public function test_show_zone_with_pricing_rules(): void
    {
        $response = $this->getJson('/api/zones', $this->auth());
        $zoneId = $response->json('0.id');

        $detail = $this->getJson("/api/zones/{$zoneId}", $this->auth());
        $detail->assertOk();
        $detail->assertJsonStructure([
            'zone' => ['id', 'name', 'slug', 'city', 'type'],
            'pricing_rules',
        ]);
    }

    public function test_calculate_price_for_zone(): void
    {
        // Obtener zona Soacha (tarifa $14,000)
        $response = $this->getJson('/api/zones', $this->auth());
        $soacha = collect($response->json())->firstWhere('slug', 'soacha');

        $calc = $this->postJson("/api/zones/{$soacha['id']}/calculate", [
            'weight_kg' => 5,
            'distance_km' => 10,
        ], $this->auth());

        $calc->assertOk();
        $this->assertGreaterThanOrEqual(14000, $calc->json('calculated_price'));
        $this->assertNotNull($calc->json('rule_applied'));
        $this->assertNotNull($calc->json('formatted'));
    }

    public function test_create_pricing_rule_for_zone(): void
    {
        $response = $this->getJson('/api/zones', $this->auth());
        $zoneId = $response->json('0.id');

        $rule = $this->postJson("/api/zones/{$zoneId}/pricing-rules", [
            'name' => 'Tarifa por peso',
            'type' => 'per_kg',
            'base_price' => 12000,
            'per_kg_price' => 1500,
            'min_price' => 12000,
        ], $this->auth());

        $rule->assertCreated();
        $this->assertEquals('per_kg', $rule->json('type'));
    }

    public function test_update_zone(): void
    {
        $response = $this->getJson('/api/zones', $this->auth());
        $zoneId = $response->json('0.id');

        $update = $this->putJson("/api/zones/{$zoneId}", [
            'description' => 'Descripción actualizada para test',
        ], $this->auth());

        $update->assertOk();
        $this->assertEquals('Descripción actualizada para test', $update->json('description'));
    }

    // ── Notificaciones ─────────────────────────────

    public function test_list_notifications(): void
    {
        $response = $this->getJson('/api/notifications', $this->auth());
        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [['id', 'type', 'title', 'body', 'read_at']],
        ]);

        // Deben haber al menos 3 notificaciones demo
        $this->assertGreaterThanOrEqual(3, count($response->json('data')));
    }

    public function test_unread_count(): void
    {
        $response = $this->getJson('/api/notifications/unread-count', $this->auth());
        $response->assertOk();
        $this->assertGreaterThanOrEqual(3, $response->json('count'));
    }

    public function test_mark_notification_read(): void
    {
        // Obtener primera notificación
        $list = $this->getJson('/api/notifications', $this->auth());
        $notifId = $list->json('data.0.id');

        // Marcar como leída
        $response = $this->postJson("/api/notifications/{$notifId}/read", [], $this->auth());
        $response->assertOk();

        // Verificar que se redujo el count
        $count = $this->getJson('/api/notifications/unread-count', $this->auth());
        $this->assertLessThanOrEqual(3, $count->json('count'));
    }

    public function test_mark_all_notifications_read(): void
    {
        $response = $this->postJson('/api/notifications/read-all', [], $this->auth());
        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, $response->json('updated'));

        // Verificar que ahora hay 0 no leídas
        $count = $this->getJson('/api/notifications/unread-count', $this->auth());
        $this->assertEquals(0, $count->json('count'));
    }

    public function test_unread_filter(): void
    {
        $response = $this->getJson('/api/notifications?unread=1', $this->auth());
        $response->assertOk();

        foreach ($response->json('data') as $notif) {
            $this->assertNull($notif['read_at']);
        }
    }

    public function test_cannot_read_other_users_notification(): void
    {
        // Login como operador
        $loginResp = $this->postJson('/api/login', [
            'email' => 'operador@danheiexpress.com',
            'password' => 'Danhei2026!',
        ]);
        $opToken = $loginResp->json('token');

        // Crear notificación directamente para el admin
        $adminNotif = \App\Domain\Shared\Models\Notification::create([
            'user_id' => $this->admin->id,
            'type' => 'test',
            'title' => 'Test privado',
        ]);

        // Intentar marcar como leída con token del operador → 403
        $response = $this->postJson(
            "/api/notifications/{$adminNotif->id}/read",
            [],
            ['Authorization' => "Bearer {$opToken}"]
        );
        $response->assertForbidden();
    }

    public function test_notification_endpoints_sync_driver_document_alerts_without_duplicates(): void
    {
        Notification::query()->delete();

        Driver::query()->create([
            'name' => 'Piloto Vencido',
            'phone' => '3000000001',
            'vehicle' => 'Moto',
            'status' => 'active',
            'driver_license_photo' => 'drivers/documents/licencia-vencida.jpg',
            'driver_license_expires_at' => now()->subDay()->toDateString(),
            'vehicle_registration_photo' => 'drivers/documents/tarjeta-vencida.jpg',
            'soat_photo' => 'drivers/documents/soat-vencido.jpg',
            'soat_expires_at' => now()->addMonths(6)->toDateString(),
            'technical_inspection_photo' => 'drivers/documents/tecno-vencida.jpg',
            'technical_inspection_expires_at' => now()->addMonths(6)->toDateString(),
            'national_id_front_photo' => 'drivers/documents/cc-front-vencida.jpg',
            'national_id_back_photo' => 'drivers/documents/cc-back-vencida.jpg',
        ]);

        Driver::query()->create([
            'name' => 'Piloto Faltante',
            'phone' => '3000000002',
            'vehicle' => 'Moto',
            'status' => 'active',
            'driver_license_photo' => 'drivers/documents/licencia-faltante.jpg',
            'driver_license_expires_at' => now()->addMonths(6)->toDateString(),
            'vehicle_registration_photo' => 'drivers/documents/tarjeta-faltante.jpg',
            'soat_photo' => 'drivers/documents/soat-faltante.jpg',
            'soat_expires_at' => now()->addMonths(6)->toDateString(),
            'technical_inspection_photo' => 'drivers/documents/tecno-faltante.jpg',
            'technical_inspection_expires_at' => now()->addMonths(6)->toDateString(),
            'national_id_front_photo' => 'drivers/documents/cc-front-faltante.jpg',
        ]);

        Driver::query()->create([
            'name' => 'Piloto Por Vencer',
            'phone' => '3000000003',
            'vehicle' => 'Moto',
            'status' => 'active',
            'driver_license_photo' => 'drivers/documents/licencia-warning.jpg',
            'driver_license_expires_at' => now()->addMonths(6)->toDateString(),
            'vehicle_registration_photo' => 'drivers/documents/tarjeta-warning.jpg',
            'soat_photo' => 'drivers/documents/soat-warning.jpg',
            'soat_expires_at' => now()->addDays(10)->toDateString(),
            'technical_inspection_photo' => 'drivers/documents/tecno-warning.jpg',
            'technical_inspection_expires_at' => now()->addMonths(6)->toDateString(),
            'national_id_front_photo' => 'drivers/documents/cc-front-warning.jpg',
            'national_id_back_photo' => 'drivers/documents/cc-back-warning.jpg',
        ]);

        $countResponse = $this->getJson('/api/notifications/unread-count', $this->auth());
        $countResponse->assertOk();
        $this->assertEquals(3, $countResponse->json('count'));

        $listResponse = $this->getJson('/api/notifications?unread=1&per_page=10', $this->auth());
        $listResponse->assertOk();

        $types = collect($listResponse->json('data'))->pluck('type')->all();
        $this->assertContains('driver_documents_expired', $types);
        $this->assertContains('driver_documents_missing', $types);
        $this->assertContains('driver_documents_warning', $types);

        $expiredNotification = collect($listResponse->json('data'))->firstWhere('type', 'driver_documents_expired');
        $this->assertEquals('/conductores?document=expired', $expiredNotification['action_url']);

        $secondCountResponse = $this->getJson('/api/notifications/unread-count', $this->auth());
        $secondCountResponse->assertOk();
        $this->assertEquals(3, $secondCountResponse->json('count'));
    }
}
