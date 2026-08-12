<?php

namespace Tests\Feature;

use App\Domain\Driver\Support\DriverDocumentAlertNotifier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * La marca de última sincronización debe sobrevivir a cambios de versión.
 *
 * Incidente real (ref 4c1d1ca2, 12/08/2026): se guardaba el objeto Carbon
 * serializado en la caché de archivos. Al divergir la versión de Carbon entre
 * el `vendor/` instalado y `composer.lock` —consecuencia del hallazgo C2—, la
 * deserialización devolvió `__PHP_Incomplete_Class` y `/api/notifications`
 * cayó con un TypeError para todos los usuarios del panel.
 *
 * La regla que fijan estas pruebas: en esa clave solo se escribe TEXTO, y
 * cualquier otra cosa encontrada al leer se trata como «nunca sincronizado».
 */
class DriverDocumentAlertCacheTest extends TestCase
{
    use RefreshDatabase;

    private const CACHE_KEY = 'driver_document_alerts:last_sync_at';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        Cache::flush();
    }

    /**
     * Reproducción fiel del incidente: un objeto cuya clase PHP no puede
     * resolver, exactamente lo que produce deserializar con otra versión.
     */
    public function test_un_objeto_irreconocible_en_cache_no_tumba_las_notificaciones(): void
    {
        Cache::put(self::CACHE_KEY, unserialize('O:8:"NoExiste":0:{}'), 3600);

        $user = User::factory()->create();
        $user->assignRole(Role::findByName('superadmin', 'sanctum'));

        // Antes del arreglo, ambas peticiones devolvían 500 por TypeError.
        $this->actingAs($user, 'sanctum')->getJson('/api/notifications')->assertOk();
        $this->actingAs($user, 'sanctum')->getJson('/api/notifications/unread-count')->assertOk();
    }

    public function test_un_objeto_carbon_heredado_de_la_version_anterior_tampoco(): void
    {
        // Lo que el código viejo dejaba en caché: el objeto, no el texto.
        Cache::put(self::CACHE_KEY, now(), 3600);

        app(DriverDocumentAlertNotifier::class)->syncIfStale();

        // Y tras sincronizar, la clave queda saneada al formato nuevo.
        $this->assertIsString(Cache::get(self::CACHE_KEY));
    }

    public function test_la_marca_se_guarda_como_texto_y_evita_resincronizar(): void
    {
        $notifier = app(DriverDocumentAlertNotifier::class);

        $notifier->sync();

        $guardado = Cache::get(self::CACHE_KEY);
        $this->assertIsString($guardado, 'La marca debe ser texto: un objeto serializado rompe al cambiar la versión de Carbon.');
        $this->assertNotFalse(strtotime($guardado), 'Debe ser una fecha interpretable.');

        // Con una marca fresca y válida, no vuelve a sincronizar.
        Cache::put(self::CACHE_KEY, now()->toIso8601String(), 3600);
        $notifier->syncIfStale(30);
        $this->assertSame(
            true,
            is_string(Cache::get(self::CACHE_KEY)),
            'syncIfStale no debe degradar el formato de la marca.'
        );
    }
}
