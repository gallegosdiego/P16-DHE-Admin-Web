<?php

namespace Tests\Feature;

use App\Domain\Operations\Services\DeploymentVerification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class DeploymentHealthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_el_endpoint_es_publico_y_responde_ok_con_el_esquema_completo(): void
    {
        $this->getJson('/api/deployment-health')
            ->assertOk()
            ->assertJson(['status' => 'ok']);
    }

    public function test_el_endpoint_no_revela_que_comprobacion_fallo(): void
    {
        $this->mock(DeploymentVerification::class, function ($mock) {
            $mock->shouldReceive('verify')->andReturn([
                'healthy' => false,
                'failures' => ['falta shipments.recipient_lat', 'falta drivers.last_lat'],
                'checks' => ['required_columns' => false],
            ]);
        });

        $response = $this->getJson('/api/deployment-health')
            ->assertStatus(503)
            ->assertJson(['status' => 'degraded', 'failed_checks' => 2]);

        // El detalle es informacion sensible: no debe salir sin autenticacion.
        $response->assertJsonMissingPath('failures');
        $this->assertStringNotContainsString('recipient_lat', $response->getContent());
    }

    public function test_detecta_una_migracion_pendiente(): void
    {
        $verification = app(DeploymentVerification::class);

        $this->assertSame([], $verification->pendingMigrations());

        // Al retirar el registro de una migracion, debe aparecer como pendiente.
        \DB::table('migrations')->where('migration', 'like', '%create_core_tables')->delete();

        $this->assertNotEmpty($verification->pendingMigrations());
    }

    public function test_detecta_una_columna_critica_ausente(): void
    {
        $this->assertTrue(app(DeploymentVerification::class)->verify()['healthy']);

        Schema::table('shipments', function ($table) {
            $table->dropColumn('recipient_address_meta');
        });

        $result = app(DeploymentVerification::class)->verify();

        $this->assertFalse($result['healthy']);
        $this->assertContains('falta shipments.recipient_address_meta', $result['failures']);
    }
}
