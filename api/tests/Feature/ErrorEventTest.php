<?php

namespace Tests\Feature;

use App\Domain\Shared\Models\ErrorEvent;
use App\Domain\Shared\Services\ErrorEventRecorder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Throwable;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ErrorEventTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
    }

    private function usuarioCon(string $rol): User
    {
        $user = User::factory()->create();
        $user->assignRole(Role::findByName($rol, 'sanctum'));

        return $user;
    }

    private function grabar(?Throwable $e = null): void
    {
        app(ErrorEventRecorder::class)->record(
            $e ?? new RuntimeException('algo se rompio'),
            Request::create('/api/shipments', 'GET'),
            'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            500,
        );
    }

    public function test_un_incidente_queda_registrado_con_su_error_id(): void
    {
        $this->grabar();

        $evento = ErrorEvent::firstOrFail();

        $this->assertSame('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', $evento->error_id);
        $this->assertSame('api/shipments', $evento->path);
        $this->assertSame(RuntimeException::class, $evento->exception_class);
        $this->assertStringContainsString('algo se rompio', $evento->message);
        $this->assertNotEmpty($evento->trace);
    }

    /**
     * La propiedad más importante: este código corre mientras algo ya falla.
     * Si el propio registrador falla —por ejemplo porque la causa del incidente
     * es que la base no responde— no puede convertir un error en una cascada.
     */
    public function test_si_el_registrador_falla_no_propaga_la_excepcion(): void
    {
        Schema::drop('error_events');

        $this->grabar();

        // Llegar hasta aquí sin excepción es exactamente lo que se comprueba.
        $this->assertTrue(true);
    }

    public function test_un_error_en_bucle_no_inunda_la_tabla(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->grabar();
        }

        // Misma excepción y misma ruta dentro de la ventana: una sola fila.
        $this->assertSame(1, ErrorEvent::count());
    }

    public function test_incidentes_distintos_si_se_registran_por_separado(): void
    {
        $this->grabar(new RuntimeException('primero'));
        $this->grabar(new \LogicException('segundo'));

        $this->assertSame(2, ErrorEvent::count());
    }

    public function test_solo_el_superadmin_consulta_los_incidentes(): void
    {
        $this->grabar();

        $this->actingAs($this->usuarioCon('administrador'), 'sanctum')
            ->getJson('/api/error-events')
            ->assertStatus(403);

        $this->actingAs($this->usuarioCon('superadmin'), 'sanctum')
            ->getJson('/api/error-events')
            ->assertOk()
            ->assertJsonPath('data.0.error_id', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    }

    public function test_un_operador_no_alcanza_siquiera_la_ruta(): void
    {
        // `operador` no tiene settings.view, asi que lo frena el middleware.
        $this->actingAs($this->usuarioCon('operador'), 'sanctum')
            ->getJson('/api/error-events')
            ->assertStatus(403);
    }

    public function test_el_resumen_cuenta_los_incidentes_recientes(): void
    {
        $this->grabar();

        $this->actingAs($this->usuarioCon('superadmin'), 'sanctum')
            ->getJson('/api/error-events/summary')
            ->assertOk()
            ->assertJsonPath('last_hour', 1)
            ->assertJsonPath('total', 1);
    }

    /**
     * La prueba de extremo a extremo: una petición HTTP real que revienta debe
     * quedar registrada, y el `error_id` de la respuesta —el que ve el usuario
     * en pantalla— debe ser el mismo con el que se busca aquí. Ese enlace es
     * justo lo que faltaba la noche del 11 de agosto.
     */
    public function test_un_500_real_queda_registrado_con_el_mismo_error_id_que_ve_el_usuario(): void
    {
        \Illuminate\Support\Facades\Route::middleware('api')->get(
            '/api/_prueba_fallo',
            fn () => throw new RuntimeException('estallido controlado'),
        );

        $respuesta = $this->getJson('/api/_prueba_fallo')->assertStatus(500);

        $errorIdDevuelto = $respuesta->json('error_id');
        $this->assertNotEmpty($errorIdDevuelto);

        $evento = ErrorEvent::where('error_id', $errorIdDevuelto)->first();

        $this->assertNotNull($evento, 'El incidente no quedó registrado.');
        $this->assertSame('api/_prueba_fallo', $evento->path);
        $this->assertStringContainsString('estallido controlado', $evento->message);
        $this->assertNotEmpty($evento->trace);
    }

    /**
     * Un 404 no es un incidente: registrar cada ruta inexistente ahogaría los
     * errores que sí importan.
     */
    public function test_un_404_no_genera_incidente(): void
    {
        $this->getJson('/api/ruta-que-no-existe')->assertStatus(404);

        $this->assertSame(0, ErrorEvent::count());
    }

    public function test_se_puede_buscar_por_error_id(): void
    {
        $this->grabar();

        $this->actingAs($this->usuarioCon('superadmin'), 'sanctum')
            ->getJson('/api/error-events?search=aaaaaaaa')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }
}
