<?php

namespace Tests\Unit;

use App\Domain\Operations\Services\DependencyDiagnostics;
use PHPUnit\Framework\TestCase;

class DependencyDiagnosticsTest extends TestCase
{
    private string $raiz;

    protected function setUp(): void
    {
        parent::setUp();
        $this->raiz = sys_get_temp_dir().'/danhei-diag-'.bin2hex(random_bytes(5));
        mkdir($this->raiz.'/vendor/composer', 0775, true);
    }

    protected function tearDown(): void
    {
        foreach (['/vendor/composer/installed.json', '/composer.lock'] as $archivo) {
            @unlink($this->raiz.$archivo);
        }
        @rmdir($this->raiz.'/vendor/composer');
        @rmdir($this->raiz.'/vendor');
        @rmdir($this->raiz);
        parent::tearDown();
    }

    /** @param array<string, string> $versiones */
    private function escribirInstalado(array $versiones): void
    {
        $paquetes = array_map(
            fn ($nombre, $version) => ['name' => $nombre, 'version' => $version],
            array_keys($versiones),
            $versiones,
        );

        file_put_contents(
            $this->raiz.'/vendor/composer/installed.json',
            json_encode(['packages' => $paquetes]),
        );
    }

    /** @param array<string, string> $versiones */
    private function escribirLock(array $versiones): void
    {
        $paquetes = array_map(
            fn ($nombre, $version) => ['name' => $nombre, 'version' => $version],
            array_keys($versiones),
            $versiones,
        );

        file_put_contents($this->raiz.'/composer.lock', json_encode(['packages' => $paquetes]));
    }

    public function test_detecta_el_desfase_entre_lo_instalado_y_el_lock(): void
    {
        // Exactamente el escenario de produccion: el vendor se subio a mano
        // hace meses y el composer.lock avanzo con parches de seguridad.
        $this->escribirInstalado(['laravel/framework' => 'v13.8.0', 'laravel/sanctum' => 'v4.3.2']);
        $this->escribirLock(['laravel/framework' => 'v13.25.0', 'laravel/sanctum' => 'v4.3.3']);

        $vendor = (new DependencyDiagnostics($this->raiz))->inspect()['vendor'];

        $this->assertTrue($vendor['readable']);
        $this->assertFalse($vendor['up_to_date']);
        $this->assertCount(2, $vendor['drift']);
        $this->assertSame('laravel/framework', $vendor['drift'][0]['package']);
        $this->assertSame('v13.8.0', $vendor['drift'][0]['installed']);
        $this->assertSame('v13.25.0', $vendor['drift'][0]['locked']);
    }

    public function test_no_reporta_desfase_cuando_coinciden(): void
    {
        $this->escribirInstalado(['laravel/framework' => 'v13.25.0']);
        $this->escribirLock(['laravel/framework' => 'v13.25.0']);

        $vendor = (new DependencyDiagnostics($this->raiz))->inspect()['vendor'];

        $this->assertTrue($vendor['up_to_date']);
        $this->assertSame([], $vendor['drift']);
    }

    public function test_sin_vendor_legible_lo_indica_en_vez_de_fallar(): void
    {
        // Un servidor sin vendor/ no debe hacer estallar el diagnostico.
        $vendor = (new DependencyDiagnostics($this->raiz))->inspect()['vendor'];

        $this->assertFalse($vendor['readable']);
        $this->assertFalse($vendor['up_to_date']);
    }

    public function test_informa_del_entorno_de_ejecucion(): void
    {
        $informe = (new DependencyDiagnostics($this->raiz))->inspect();

        $this->assertSame(PHP_VERSION, $informe['php']['version']);
        $this->assertNotEmpty($informe['php']['memory_limit']);
        $this->assertIsBool($informe['exec']['available']);
        $this->assertIsBool($informe['composer']['found']);
    }
}
