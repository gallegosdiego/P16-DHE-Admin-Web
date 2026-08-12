<?php

namespace App\Domain\Operations\Services;

use Throwable;

/**
 * Averigua qué puede hacer el servidor respecto a dependencias.
 *
 * Existe por el hallazgo **C2**: el despliegue nunca ejecuta `composer
 * install`, así que el `vendor/` de producción es el que alguien subió a mano.
 * Cuando `composer.lock` sube una versión por un parche de seguridad, ese
 * parche no llega al servidor — y como este hosting no tiene terminal, ni
 * siquiera se puede comprobar qué versión corre realmente.
 *
 * Este diagnóstico responde dos preguntas desde dentro del propio despliegue:
 *
 *  1. ¿Se puede ejecutar Composer aquí? Si la respuesta es sí, C2 se resuelve
 *     añadiendo un paso. Si es no, hay que construir `vendor/` fuera y traerlo.
 *  2. ¿Cuánto se ha desviado el `vendor/` instalado respecto al `composer.lock`?
 *     Es la medida real del riesgo acumulado.
 */
class DependencyDiagnostics
{
    /** Paquetes cuyo desfase importa más, por ser los que reciben parches de seguridad. */
    private const PAQUETES_CLAVE = [
        'laravel/framework',
        'laravel/sanctum',
        'symfony/http-kernel',
        'guzzlehttp/guzzle',
        'league/commonmark',
    ];

    public function __construct(private readonly string $appRoot)
    {
    }

    /**
     * @return array{
     *     php: array{version: string, memory_limit: string},
     *     exec: array{available: bool, reason: string},
     *     composer: array{found: bool, path: string|null, version: string|null},
     *     vendor: array{readable: bool, drift: list<array{package: string, installed: string, locked: string}>, up_to_date: bool}
     * }
     */
    public function inspect(): array
    {
        return [
            'php' => [
                'version' => PHP_VERSION,
                'memory_limit' => (string) ini_get('memory_limit'),
            ],
            'exec' => $this->execAvailability(),
            'composer' => $this->locateComposer(),
            'vendor' => $this->vendorDrift(),
        ];
    }

    /**
     * @return array{available: bool, reason: string}
     */
    private function execAvailability(): array
    {
        if (! function_exists('exec')) {
            return ['available' => false, 'reason' => 'la función exec no existe'];
        }

        $deshabilitadas = array_map('trim', explode(',', (string) ini_get('disable_functions')));

        if (in_array('exec', $deshabilitadas, true)) {
            return ['available' => false, 'reason' => 'exec está en disable_functions'];
        }

        return ['available' => true, 'reason' => 'disponible'];
    }

    /**
     * @return array{found: bool, path: string|null, version: string|null}
     */
    private function locateComposer(): array
    {
        if (! $this->execAvailability()['available']) {
            return ['found' => false, 'path' => null, 'version' => null];
        }

        // Un `composer.phar` junto a la aplicación es el camino más fiable en
        // hosting compartido, donde el binario global suele no existir.
        $candidatos = [
            $this->appRoot.'/composer.phar',
            'composer',
            '/usr/local/bin/composer',
            '/opt/cpanel/composer/bin/composer',
        ];

        foreach ($candidatos as $candidato) {
            $version = $this->composerVersion($candidato);

            if ($version !== null) {
                return ['found' => true, 'path' => $candidato, 'version' => $version];
            }
        }

        return ['found' => false, 'path' => null, 'version' => null];
    }

    private function composerVersion(string $binario): ?string
    {
        try {
            $comando = str_ends_with($binario, '.phar')
                ? (is_file($binario) ? PHP_BINARY.' '.escapeshellarg($binario).' --version 2>&1' : null)
                : escapeshellarg($binario).' --version 2>&1';

            if ($comando === null) {
                return null;
            }

            $salida = [];
            $codigo = 0;
            @exec($comando, $salida, $codigo);

            if ($codigo !== 0 || $salida === []) {
                return null;
            }

            // Composer colorea su salida; los códigos ANSI ensucian el registro
            // de despliegue de cPanel, que se lee como texto plano.
            $primera = preg_replace('/\e\[[0-9;]*m/', '', (string) ($salida[0] ?? ''));

            return str_contains((string) $primera, 'Composer') ? trim((string) $primera) : null;
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * Compara lo instalado con lo que declara `composer.lock`.
     *
     * @return array{readable: bool, drift: list<array{package: string, installed: string, locked: string}>, up_to_date: bool}
     */
    private function vendorDrift(): array
    {
        $instalados = $this->installedVersions();
        $bloqueados = $this->lockedVersions();

        if ($instalados === null || $bloqueados === null) {
            return ['readable' => false, 'drift' => [], 'up_to_date' => false];
        }

        $desfase = [];

        foreach (self::PAQUETES_CLAVE as $paquete) {
            $instalado = $instalados[$paquete] ?? null;
            $bloqueado = $bloqueados[$paquete] ?? null;

            if ($instalado === null || $bloqueado === null || $instalado === $bloqueado) {
                continue;
            }

            $desfase[] = [
                'package' => $paquete,
                'installed' => $instalado,
                'locked' => $bloqueado,
            ];
        }

        return [
            'readable' => true,
            'drift' => $desfase,
            'up_to_date' => $desfase === [],
        ];
    }

    /** @return array<string, string>|null */
    private function installedVersions(): ?array
    {
        return $this->versionsFromJson(
            $this->appRoot.'/vendor/composer/installed.json',
            fn (array $datos) => $datos['packages'] ?? $datos,
        );
    }

    /** @return array<string, string>|null */
    private function lockedVersions(): ?array
    {
        return $this->versionsFromJson(
            $this->appRoot.'/composer.lock',
            fn (array $datos) => $datos['packages'] ?? [],
        );
    }

    /**
     * @param  callable(array): array  $extraer
     * @return array<string, string>|null
     */
    private function versionsFromJson(string $ruta, callable $extraer): ?array
    {
        try {
            if (! is_file($ruta)) {
                return null;
            }

            $datos = json_decode((string) file_get_contents($ruta), true);

            if (! is_array($datos)) {
                return null;
            }

            $versiones = [];

            foreach ($extraer($datos) as $paquete) {
                if (isset($paquete['name'], $paquete['version'])) {
                    $versiones[$paquete['name']] = $paquete['version'];
                }
            }

            return $versiones;
        } catch (Throwable) {
            return null;
        }
    }
}
