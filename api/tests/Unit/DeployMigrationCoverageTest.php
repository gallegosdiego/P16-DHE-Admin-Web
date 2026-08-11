<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Vigila que el despliegue siga aplicando TODAS las migraciones.
 *
 * Origen: el 11 de agosto de 2026 se encontró que producción tenía 29
 * migraciones registradas frente a 40 archivos en el repositorio. La causa era
 * una lista blanca `--path` mantenida a mano dentro del script de despliegue:
 * toda migración que nadie recordara añadir simplemente no se aplicaba, y el
 * fallo era silencioso hasta manifestarse en runtime.
 *
 * Confiar en que nadie lo olvide ya falló una vez. La guardia es automática.
 */
class DeployMigrationCoverageTest extends TestCase
{
    private function deployScript(): string
    {
        $path = dirname(__DIR__, 2).'/scripts/deploy-cpanel-all.php';

        $this->assertFileExists($path, 'No se encontró el script de despliegue.');

        return (string) file_get_contents($path);
    }

    public function test_el_despliegue_no_restringe_las_migraciones_con_una_lista_blanca(): void
    {
        $this->assertStringNotContainsString(
            "'--path'",
            $this->deployScript(),
            'El despliegue volvió a usar `--path`. Una lista blanca de migraciones '
            .'mantenida a mano deja fuera en silencio toda migración nueva que '
            .'nadie recuerde añadir. Usa `migrate --force` sin restricción.'
        );
    }

    public function test_el_despliegue_ejecuta_migrate_forzado(): void
    {
        $this->assertMatchesRegularExpression(
            "/Artisan::call\(\s*'migrate'/",
            $this->deployScript(),
            'El despliegue ya no invoca `migrate`. Sin ese paso, ningún cambio de '
            .'esquema llega a producción.'
        );
    }

    /**
     * Las migraciones que el despliegue adopta como ya materializadas deben
     * existir como archivo. Un nombre mal escrito registraría una migración
     * inexistente y ocultaría para siempre la real.
     */
    public function test_las_migraciones_adoptadas_existen_en_el_repositorio(): void
    {
        $script = $this->deployScript();
        $migrationsDir = dirname(__DIR__, 2).'/database/migrations';

        preg_match_all("/'(\d{4}_\d{2}_\d{2}_\d{6}_[a-z0-9_]+)'\s*=>\s*\[/", $script, $matches);

        $this->assertNotEmpty(
            $matches[1],
            'No se encontró la lista de migraciones materializadas en el script.'
        );

        foreach ($matches[1] as $migration) {
            $this->assertFileExists(
                $migrationsDir.'/'.$migration.'.php',
                "El despliegue adoptaría `{$migration}`, que no existe como archivo."
            );
        }
    }
}
