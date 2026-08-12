<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Contrato de la Content-Security-Policy del panel.
 *
 * La CSP existía pero venía debilitada de origen: `unsafe-eval` en `script-src`
 * y una URL de desarrollo (`http://127.0.0.1:8000`) en `connect-src`. Lo
 * primero anula buena parte de su valor como defensa contra XSS; lo segundo era
 * residuo que además rompe la política de contenido mixto.
 *
 * Se comprobó que ningún chunk del build de producción usa `eval` ni
 * `new Function`, así que retirarlo no cuesta nada. Esta prueba impide que
 * vuelva sin que nadie lo note.
 */
class ContentSecurityPolicyTest extends TestCase
{
    private function csp(): string
    {
        $ruta = dirname(__DIR__, 3).'/frontend/vercel.json';

        $this->assertFileExists($ruta, 'No se encontró la configuración de cabeceras del panel.');

        $config = json_decode((string) file_get_contents($ruta), true);

        foreach ($config['headers'] ?? [] as $bloque) {
            foreach ($bloque['headers'] ?? [] as $cabecera) {
                if (($cabecera['key'] ?? '') === 'Content-Security-Policy') {
                    return (string) $cabecera['value'];
                }
            }
        }

        $this->fail('El panel no declara Content-Security-Policy.');
    }

    public function test_no_permite_unsafe_eval(): void
    {
        $this->assertStringNotContainsString(
            'unsafe-eval',
            $this->csp(),
            "'unsafe-eval' permite ejecutar cadenas como código y anula buena parte "
            .'de la CSP como defensa contra XSS. El build de producción no lo necesita.',
        );
    }

    public function test_no_apunta_a_localhost(): void
    {
        $csp = $this->csp();

        foreach (['127.0.0.1', 'localhost'] as $local) {
            $this->assertStringNotContainsString(
                $local,
                $csp,
                "La CSP de producción no debe autorizar {$local}: es residuo de "
                .'desarrollo y contenido mixto que el navegador bloquea.',
            );
        }
    }

    public function test_conserva_las_defensas_que_ya_existian(): void
    {
        $csp = $this->csp();

        // Endurecer no puede significar perder lo que ya protegía.
        $this->assertStringContainsString("default-src 'self'", $csp);
        $this->assertStringContainsString("frame-ancestors 'none'", $csp);
        $this->assertStringContainsString('https://api.danheiexpress.com', $csp);
    }
}
