<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TokenExpiryTest extends TestCase
{
    use RefreshDatabase;

    private const CLAVE = 'ClaveDePrueba123!';

    private function usuario(): User
    {
        return User::factory()->create([
            'email' => 'piloto@danheiexpress.com',
            'password' => Hash::make(self::CLAVE),
        ]);
    }

    private function entrar(?string $dispositivo = null): void
    {
        $datos = ['email' => 'piloto@danheiexpress.com', 'password' => self::CLAVE];

        if ($dispositivo !== null) {
            $datos['device_name'] = $dispositivo;
        }

        $this->postJson('/api/login', $datos)->assertOk();
    }

    public function test_el_token_del_panel_caduca_en_doce_horas(): void
    {
        $user = $this->usuario();

        $this->entrar();

        $token = $user->tokens()->firstOrFail();

        $this->assertNotNull($token->expires_at, 'El token del panel no debe ser eterno.');
        $this->assertEqualsWithDelta(12 * 60, now()->diffInMinutes($token->expires_at), 5);
    }

    /**
     * Expirar al piloto a media jornada lo dejaria sin poder cerrar entregas en
     * la calle, asi que su token vive mas. El riesgo es menor: el telefono es
     * personal y el token va en almacenamiento cifrado del sistema.
     */
    public function test_el_token_de_la_app_del_piloto_dura_treinta_dias(): void
    {
        $user = $this->usuario();

        $this->entrar('P15_Driver_App');

        $token = $user->tokens()->firstOrFail();

        $this->assertNotNull($token->expires_at);
        $this->assertEqualsWithDelta(30 * 24 * 60, now()->diffInMinutes($token->expires_at), 10);
    }

    public function test_un_token_caducado_ya_no_autentica(): void
    {
        $user = $this->usuario();
        $this->entrar();

        $token = $user->tokens()->firstOrFail();
        $token->forceFill(['expires_at' => now()->subMinute()])->save();

        // Sanctum descarta el token vencido: la sesion deja de valer.
        $this->withHeader('Authorization', 'Bearer '.$token->id.'|token-invalido')
            ->getJson('/api/me')
            ->assertStatus(401);
    }

    /**
     * Desplegar la caducidad no puede expulsar a quien ya tenia sesion abierta.
     * Los tokens emitidos antes conservan expires_at nulo y siguen sirviendo.
     */
    public function test_los_tokens_ya_emitidos_siguen_siendo_validos(): void
    {
        $user = $this->usuario();
        $antiguo = $user->createToken('web-session');

        $this->assertNull($antiguo->accessToken->expires_at);

        $this->withHeader('Authorization', 'Bearer '.$antiguo->plainTextToken)
            ->getJson('/api/me')
            ->assertOk();
    }
}
