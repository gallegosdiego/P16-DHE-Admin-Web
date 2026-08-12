<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class CpanelDeploymentContractTest extends TestCase
{
    public function test_deployment_uses_three_short_tasks_with_consolidated_script(): void
    {
        $cpanel = $this->cpanelConfiguration();

        $this->assertStringContainsString(
            '/bin/cp -R api/. /home/danheiex/api.danheiexpress.com/',
            $cpanel,
        );
        $this->assertStringContainsString(
            'cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php scripts/deploy-cpanel-all.php 2>&1',
            $cpanel,
        );

        // Must NOT delegate to long-running bash orchestrators.
        $this->assertStringNotContainsString('deploy-cpanel-release.sh', $cpanel);
        $this->assertStringNotContainsString('deploy-cpanel.sh', $cpanel);
        $this->assertStringNotContainsString('export ', $cpanel);
        $this->assertStringNotContainsString('timeout ', $cpanel);
        $this->assertStringNotContainsString('flock ', $cpanel);
    }

    public function test_deployment_has_exactly_three_tasks(): void
    {
        $cpanel = $this->cpanelConfiguration();

        preg_match_all('/^\s+-\s+/m', $cpanel, $matches);
        $taskCount = count($matches[0]);

        $this->assertSame(3, $taskCount,
            "The .cpanel.yml must keep exactly 3 tasks. Found {$taskCount}.",
        );
    }

    /**
     * Contrato del script consolidado.
     *
     * Hasta el 11 de agosto de 2026 esta prueba exigía que el script enumerase
     * a mano las 17 migraciones críticas. Esa expectativa **convertía el defecto
     * en contrato**: la lista blanca `--path` dejaba fuera en silencio toda
     * migración que nadie recordara añadir —así llegaron 11 a no aplicarse en
     * producción— y este test bloqueaba a quien intentara retirarla.
     *
     * El contrato correcto no es «que la lista esté completa» sino «que no haya
     * lista». La cobertura la garantiza `migrate` sin restricción, y
     * `DeployMigrationCoverageTest` vigila que no reaparezca.
     */
    public function test_consolidated_script_exists_and_covers_all_critical_phases(): void
    {
        $script = $this->readFile(
            dirname(__DIR__, 2).'/scripts/deploy-cpanel-all.php',
        );

        // Must cover all three deployment phases.
        foreach (['schema_core', 'runtime_repairs', 'financial_schema'] as $phase) {
            $this->assertStringContainsString($phase, $script);
        }

        // Must apply every migration in the directory, with no allowlist.
        $this->assertStringNotContainsString(
            "'--path'",
            $script,
            'El despliegue volvió a restringir las migraciones con una lista blanca.',
        );

        // Must reconcile already-materialized migrations before migrating, or
        // the six created outside the migration system would collide.
        $this->assertStringContainsString('Reconcile migration history', $script);

        // Los reparadores de esquema NO deben volver. El diagnóstico del 12 de
        // agosto de 2026 revelo que `exec` no existe en el servidor, asi que
        // fallaban en todos los despliegues sin que nadie lo notara — eran
        // pasos no bloqueantes y su ruido enterraba las advertencias reales.
        // Reconciliado el historial de migraciones, ademas son redundantes.
        foreach ([
            'repair-public-storage-link.php',
            'repair-cod-schema.php',
            'repair-driver-mobile-geo-schema.php',
            'repair-driver-documents-schema.php',
        ] as $repairScript) {
            $this->assertStringNotContainsString(
                $repairScript,
                $script,
                "El despliegue volvio a invocar {$repairScript}. No puede funcionar: "
                .'`exec` esta deshabilitada en el servidor.',
            );
        }

        // Y sin exec, ningun paso del despliegue debe depender de ella.
        $this->assertStringNotContainsString(
            'exec(',
            $script,
            'El despliegue no puede depender de exec: no existe en el servidor.',
        );

        // The critical intake recovery runs in the current PHP process. It must
        // not spawn the two historical verifier subprocesses.
        $this->assertStringContainsString('OperationalIntakeSchemaRecovery::class', $script);
        $this->assertStringNotContainsString('ensure-operational-intake-schema.php', $script);
        $this->assertStringNotContainsString('repair-operational-intake-schema.php', $script);
        $this->assertSame(2, substr_count($script, "Artisan::call('migrate'"));
    }

    public function test_consolidated_script_uses_error_handling_to_avoid_hanging(): void
    {
        $script = $this->readFile(
            dirname(__DIR__, 2).'/scripts/deploy-cpanel-all.php',
        );

        // Must use try/catch to prevent hanging on errors.
        $this->assertStringContainsString('try {', $script);
        $this->assertStringContainsString('catch', $script);

        // Must write a real failure marker before the controlled exit that
        // prevents failed UserTasks from remaining queued.
        $this->assertStringContainsString('finishControlledFailure', $script);
        $this->assertStringContainsString('$marker->failed(', $script);
        $this->assertStringContainsString('exit(0)', $script);
        $this->assertStringNotContainsString(
            "writeMarker('running', \$repositoryRoot, 'completed_with_errors')",
            $script,
        );
    }

    public function test_optional_whatsapp_and_route_index_work_cannot_block_deployment(): void
    {
        $cpanel = $this->cpanelConfiguration();
        $script = $this->readFile(
            dirname(__DIR__, 2).'/scripts/deploy-cpanel-all.php',
        );

        $this->assertStringNotContainsString(
            '2026_07_07_130000_create_whatsapp_pickup_foundation_tables.php',
            $cpanel,
        );
        $this->assertStringNotContainsString('repair-route-day-index.php', $cpanel);
        $this->assertStringNotContainsString('repair-route-day-index.php', $script);
    }

    public function test_deployment_marker_script_resolves_commit_and_writes_atomically(): void
    {
        $repositoryRoot = sys_get_temp_dir().'/danhei-cpanel-repository-'.bin2hex(random_bytes(5));
        $logDirectory = sys_get_temp_dir().'/danhei-cpanel-markers-'.bin2hex(random_bytes(5));
        $commit = str_repeat('a', 40);

        mkdir($repositoryRoot.'/.git/refs/heads', 0775, true);
        mkdir($logDirectory, 0775, true);
        file_put_contents($repositoryRoot.'/.git/HEAD', "ref: refs/heads/main\n");
        file_put_contents($repositoryRoot.'/.git/refs/heads/main', $commit."\n");

        $previousLogDirectory = getenv('DANHEI_MARKER_LOG_DIRECTORY');
        putenv('DANHEI_MARKER_LOG_DIRECTORY='.$logDirectory);

        try {
            [$runningExit, $runningOutput] = $this->runMarker('running', $repositoryRoot, 'schema core');
            $this->assertSame(0, $runningExit, $runningOutput);
            $this->assertStringContainsString('status=running', $this->readFile($logDirectory.'/deploy-cpanel.last-attempt'));
            $this->assertStringContainsString('phase=schema_core', $this->readFile($logDirectory.'/deploy-cpanel.last-attempt'));

            [$failedExit, $failedOutput] = $this->runMarker(
                'failed',
                $repositoryRoot,
                'schema core failed',
                7,
            );
            $this->assertSame(0, $failedExit, $failedOutput);
            $this->assertStringContainsString('status=failed', $this->readFile($logDirectory.'/deploy-cpanel.last-failure'));
            $this->assertStringContainsString('phase=schema_core_failed', $this->readFile($logDirectory.'/deploy-cpanel.last-failure'));
            $this->assertStringContainsString('exit_code=7', $this->readFile($logDirectory.'/deploy-cpanel.last-failure'));

            [$successExit, $successOutput] = $this->runMarker('success', $repositoryRoot, 'complete');
            $this->assertSame(0, $successExit, $successOutput);
            $this->assertStringContainsString('commit='.$commit, $this->readFile($logDirectory.'/deploy-cpanel.last-success'));
            $this->assertStringContainsString('status=success', $this->readFile($logDirectory.'/deploy-cpanel.last-success'));
            $this->assertFileDoesNotExist($logDirectory.'/deploy-cpanel.last-failure');
            $this->assertSame([], glob($logDirectory.'/*.tmp-*') ?: []);
        } finally {
            if ($previousLogDirectory === false) {
                putenv('DANHEI_MARKER_LOG_DIRECTORY');
            } else {
                putenv('DANHEI_MARKER_LOG_DIRECTORY='.$previousLogDirectory);
            }

            $this->removeDirectory($repositoryRoot);
            $this->removeDirectory($logDirectory);
        }
    }

    private function cpanelConfiguration(): string
    {
        return $this->readFile(dirname(__DIR__, 3).'/.cpanel.yml');
    }

    private function readFile(string $path): string
    {
        $contents = file_get_contents($path);
        $this->assertIsString($contents, "Unable to read {$path}");

        return $contents;
    }

    /**
     * @return array{int, string}
     */
    private function runMarker(
        string $status,
        string $repositoryRoot,
        string $phase,
        int $exitCode = 1,
    ): array {
        $script = dirname(__DIR__, 2).'/scripts/write-cpanel-deployment-marker.php';
        $pipes = [];
        $process = proc_open(
            [PHP_BINARY, $script, $status, $repositoryRoot, $phase, (string) $exitCode],
            [
                1 => ['pipe', 'w'],
                2 => ['pipe', 'w'],
            ],
            $pipes,
        );

        $this->assertIsResource($process);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);

        return [$exitCode, trim($stdout."\n".$stderr)];
    }

    private function removeDirectory(string $directory): void
    {
        if (! is_dir($directory)) {
            return;
        }

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($directory, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );

        foreach ($iterator as $item) {
            if ($item->isDir()) {
                rmdir($item->getPathname());
            } else {
                unlink($item->getPathname());
            }
        }

        rmdir($directory);
    }
}
