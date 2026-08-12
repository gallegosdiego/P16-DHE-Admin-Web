<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Ningún índice puede generar un nombre que MySQL rechace.
 *
 * Laravel deriva el nombre de un índice sin nombre propio concatenando tabla,
 * columnas y tipo. MySQL admite como máximo 64 caracteres en un identificador,
 * y al superarlo la migración falla entera.
 *
 * **Por qué esto no lo detectaban las pruebas:** corren sobre SQLite, que no
 * tiene ese límite. Cinco índices llevaban meses sin existir en producción
 * mientras la suite pasaba en verde — incluidas dos restricciones únicas que
 * impedían duplicar asignaciones de dinero de un piloto.
 *
 * Se descubrió al ejecutar la suite por accidente contra MariaDB. Esta prueba
 * lo convierte en algo que se detecta en cada cambio, sin depender del azar.
 */
class IndexNameLengthTest extends TestCase
{
    private const LIMITE_MYSQL = 64;

    public function test_ningun_indice_genera_un_nombre_que_mysql_rechace(): void
    {
        $demasiadoLargos = [];

        foreach (glob(dirname(__DIR__, 2).'/database/migrations/*.php') as $archivo) {
            $contenido = (string) file_get_contents($archivo);

            foreach ($this->indicesSinNombrePropio($contenido) as [$tabla, $columnas, $tipo]) {
                $generado = $tabla.'_'.implode('_', $columnas).'_'.$tipo;

                if (strlen($generado) > self::LIMITE_MYSQL) {
                    $demasiadoLargos[] = sprintf(
                        '%s → %s (%d caracteres)',
                        basename($archivo),
                        $generado,
                        strlen($generado),
                    );
                }
            }
        }

        $this->assertSame(
            [],
            $demasiadoLargos,
            'Estos índices generarían un nombre que MySQL rechaza. Dales un nombre '
            ."explícito y corto como segundo argumento:\n  ".implode("\n  ", $demasiadoLargos),
        );
    }

    /**
     * La prueba debe detectar índices de verdad, no pasar por no encontrar nada.
     */
    public function test_la_deteccion_encuentra_los_indices_de_las_migraciones(): void
    {
        $contenido = (string) file_get_contents(
            dirname(__DIR__, 2).'/database/migrations/2026_07_12_150000_create_reconciliation_ledgers.php',
        );

        $this->assertNotEmpty(
            $this->indicesSinNombrePropio($contenido),
            'La detección no encontró ningún índice: el patrón está roto y la otra '
            .'prueba estaría pasando en verde sin mirar nada.',
        );
    }

    /**
     * Índices declarados sin nombre propio, con la tabla a la que pertenecen.
     *
     * @return list<array{0: string, 1: list<string>, 2: string}>
     */
    private function indicesSinNombrePropio(string $contenido): array
    {
        $encontrados = [];

        // Comillas simples a propósito: entre comillas dobles PHP interpolaría
        // `$table` y el patrón dejaría de coincidir — la prueba pasaría en verde
        // sin haber mirado una sola migración.
        preg_match_all(
            '/\$table->(unique|index)\(\s*\[([^\]]+)\]\s*(,\s*\'[^\']+\')?\s*\)/',
            $contenido,
            $indices,
            PREG_OFFSET_CAPTURE | PREG_SET_ORDER,
        );

        foreach ($indices as $indice) {
            // Con nombre explícito no hay nada que comprobar.
            if (! empty($indice[3][0])) {
                continue;
            }

            // Se busca la tabla hacia atrás desde el índice. Agrupar por bloques
            // fallaba con `Schema` anidados y dejó pasar un índice de 65
            // caracteres que solo apareció al migrar contra MySQL de verdad.
            $antes = substr($contenido, 0, (int) $indice[0][1]);

            if (! preg_match_all('/(?:Schema::\w*\(|createIfMissing\()\s*\'([a-z_]+)\'/', $antes, $tablas)) {
                continue;
            }

            $columnas = array_map(
                static fn (string $columna): string => trim($columna, " \t\n\r'\""),
                explode(',', $indice[2][0]),
            );

            $encontrados[] = [(string) end($tablas[1]), $columnas, $indice[1][0]];
        }

        return $encontrados;
    }
}
