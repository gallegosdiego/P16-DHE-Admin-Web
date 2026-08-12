<?php

namespace Tests\Feature;

use App\Domain\Shared\Models\AppSetting;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shared\Services\IntegrationSettings;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class IntegrationSettingsTest extends TestCase
{
    use RefreshDatabase;

    private const CLAVE_FALSA = 'AIzaSyDEMO0000000000000000000000ABCD';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        app(IntegrationSettings::class)->flush();
    }

    private function superadmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole(Role::findByName('superadmin', 'sanctum'));

        return $user;
    }

    /**
     * `administrador` tiene `settings.edit` pero no es superadministrador:
     * es exactamente el caso que la puerta de secretos debe frenar.
     */
    private function administrador(): User
    {
        $user = User::factory()->create();
        $user->assignRole(Role::findByName('administrador', 'sanctum'));

        return $user;
    }

    public function test_un_secreto_guardado_nunca_se_devuelve_en_claro(): void
    {
        $admin = $this->superadmin();

        $this->actingAs($admin, 'sanctum')->putJson('/api/settings/integrations', [
            'key' => 'google.maps_key',
            'value' => self::CLAVE_FALSA,
        ])->assertOk();

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/settings/integrations')->assertOk();

        // Ni siquiera al superadministrador que acaba de guardarla.
        $this->assertStringNotContainsString(self::CLAVE_FALSA, $response->getContent());

        $fila = collect($response->json('settings'))->firstWhere('key', 'google.maps_key');
        $this->assertTrue($fila['configured']);
        $this->assertSame('panel', $fila['source']);
        $this->assertStringEndsWith('ABCD', $fila['preview']);
        $this->assertStringContainsString('•', $fila['preview']);
    }

    public function test_el_valor_se_guarda_cifrado_en_la_base(): void
    {
        $this->actingAs($this->superadmin(), 'sanctum')->putJson('/api/settings/integrations', [
            'key' => 'google.maps_key',
            'value' => self::CLAVE_FALSA,
        ])->assertOk();

        $crudo = DB::table('app_settings')->where('key', 'google.maps_key')->value('value');

        // Un volcado de la base no debe revelar la credencial.
        $this->assertNotSame(self::CLAVE_FALSA, $crudo);
        $this->assertStringNotContainsString(self::CLAVE_FALSA, (string) $crudo);
        $this->assertSame(self::CLAVE_FALSA, AppSetting::where('key', 'google.maps_key')->first()->value);
    }

    public function test_el_valor_guardado_sustituye_al_del_servidor(): void
    {
        config(['services.google.maps_key' => 'valor-del-env']);

        $this->actingAs($this->superadmin(), 'sanctum')->putJson('/api/settings/integrations', [
            'key' => 'google.maps_key',
            'value' => self::CLAVE_FALSA,
        ])->assertOk();

        $almacenado = app(IntegrationSettings::class)->stored();

        $this->assertSame(self::CLAVE_FALSA, $almacenado['google.maps_key']);
    }

    public function test_vaciar_devuelve_el_control_al_servidor(): void
    {
        $admin = $this->superadmin();
        config(['services.google.maps_key' => 'valor-del-env']);

        $this->actingAs($admin, 'sanctum')->putJson('/api/settings/integrations', [
            'key' => 'google.maps_key', 'value' => self::CLAVE_FALSA,
        ])->assertOk();

        $this->actingAs($admin, 'sanctum')->putJson('/api/settings/integrations', [
            'key' => 'google.maps_key', 'value' => '',
        ])->assertOk();

        $this->assertDatabaseMissing('app_settings', ['key' => 'google.maps_key']);

        $fila = collect($this->actingAs($admin, 'sanctum')->getJson('/api/settings/integrations')->json('settings'))
            ->firstWhere('key', 'google.maps_key');

        $this->assertSame('servidor', $fila['source']);
    }

    public function test_un_administrador_no_superadmin_no_puede_tocar_secretos(): void
    {
        $this->actingAs($this->administrador(), 'sanctum')->putJson('/api/settings/integrations', [
            'key' => 'google.maps_key',
            'value' => self::CLAVE_FALSA,
        ])->assertStatus(403);

        $this->assertDatabaseMissing('app_settings', ['key' => 'google.maps_key']);
    }

    public function test_un_administrador_no_superadmin_si_puede_cambiar_valores_no_secretos(): void
    {
        $this->actingAs($this->administrador(), 'sanctum')->putJson('/api/settings/integrations', [
            'key' => 'google.default_recipient_city',
            'value' => 'Medellin',
        ])->assertOk();

        $this->assertDatabaseHas('app_settings', ['key' => 'google.default_recipient_city']);
    }

    public function test_no_se_admite_una_clave_fuera_del_catalogo(): void
    {
        // Aceptar nombres arbitrarios convertiria este permiso en escritura
        // libre sobre la configuracion de Laravel.
        $this->actingAs($this->superadmin(), 'sanctum')->putJson('/api/settings/integrations', [
            'key' => 'database.connections.mysql.host',
            'value' => 'servidor-del-atacante',
        ])->assertStatus(422);

        $this->assertDatabaseCount('app_settings', 0);
    }

    public function test_la_bitacora_registra_el_cambio_pero_nunca_el_valor(): void
    {
        $this->actingAs($this->superadmin(), 'sanctum')->putJson('/api/settings/integrations', [
            'key' => 'google.maps_key',
            'value' => self::CLAVE_FALSA,
        ])->assertOk();

        $registro = AuditLog::where('action', 'settings.integration_created')->first();

        $this->assertNotNull($registro);
        $this->assertStringNotContainsString(self::CLAVE_FALSA, json_encode($registro->toArray()));
    }


    public function test_el_generador_de_app_key_no_aplica_ni_guarda_la_clave(): void
    {
        $original = config('app.key');

        $respuesta = $this->actingAs($this->superadmin(), 'sanctum')
            ->postJson('/api/settings/app-key')
            ->assertOk();

        $generada = $respuesta->json('key');

        // Formato valido de Laravel: base64 de 32 bytes.
        $this->assertStringStartsWith('base64:', $generada);
        $this->assertSame(32, strlen(base64_decode(substr($generada, 7))));

        // Lo esencial: la aplicacion NO se aplica la clave a si misma. Si
        // pudiera, un fallo la dejaria sin arrancar y sin forma de deshacerlo
        // desde el propio panel.
        $this->assertSame($original, config('app.key'));
        $this->assertDatabaseMissing('app_settings', ['key' => 'app.key']);
    }

    public function test_cada_llamada_genera_una_clave_distinta(): void
    {
        $admin = $this->superadmin();

        $a = $this->actingAs($admin, 'sanctum')->postJson('/api/settings/app-key')->json('key');
        $b = $this->actingAs($admin, 'sanctum')->postJson('/api/settings/app-key')->json('key');

        $this->assertNotSame($a, $b);
    }

    public function test_avisa_si_rotar_ya_no_es_gratis(): void
    {
        $admin = $this->superadmin();

        // Boveda vacia: rotar no cuesta nada.
        $this->actingAs($admin, 'sanctum')->postJson('/api/settings/app-key')
            ->assertJsonPath('vault_is_empty', true)
            ->assertJsonPath('stored_credentials', 0);

        $this->actingAs($admin, 'sanctum')->putJson('/api/settings/integrations', [
            'key' => 'google.maps_key', 'value' => self::CLAVE_FALSA,
        ])->assertOk();

        // Con una credencial guardada, rotar la volveria ilegible.
        $this->actingAs($admin, 'sanctum')->postJson('/api/settings/app-key')
            ->assertJsonPath('vault_is_empty', false)
            ->assertJsonPath('stored_credentials', 1);
    }

    public function test_un_administrador_no_superadmin_no_puede_generar_la_clave(): void
    {
        $this->actingAs($this->administrador(), 'sanctum')
            ->postJson('/api/settings/app-key')
            ->assertStatus(403);
    }

    public function test_la_bitacora_no_registra_la_clave_generada(): void
    {
        $this->actingAs($this->superadmin(), 'sanctum')->postJson('/api/settings/app-key')->assertOk();

        $registro = AuditLog::where('action', 'settings.app_key_generated')->firstOrFail();

        $this->assertStringNotContainsString('base64:', json_encode($registro->toArray()));
    }

    public function test_guardar_una_credencial_registra_cuando_se_roto(): void
    {
        $admin = $this->superadmin();

        $this->actingAs($admin, 'sanctum')->putJson('/api/settings/integrations', [
            'key' => 'google.maps_key', 'value' => self::CLAVE_FALSA,
        ])->assertOk();

        $fila = collect($this->actingAs($admin, 'sanctum')->getJson('/api/settings/integrations')->json('settings'))
            ->firstWhere('key', 'google.maps_key');

        $this->assertNotNull($fila['last_rotated_at']);
    }

    public function test_sin_nada_guardado_el_sistema_se_comporta_igual_que_antes(): void
    {
        // Estado de partida: instalar esta funcionalidad no debe cambiar nada.
        $this->assertSame([], app(IntegrationSettings::class)->stored());

        $fila = collect($this->actingAs($this->superadmin(), 'sanctum')->getJson('/api/settings/integrations')->json('settings'))
            ->firstWhere('key', 'whatsapp.access_token');

        $this->assertNotSame('panel', $fila['source']);
    }
}
