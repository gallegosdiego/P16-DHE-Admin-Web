<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class CpanelDeploymentContractTest extends TestCase
{
    public function test_recovery_deployment_uses_short_direct_tasks_and_literal_paths(): void
    {
        $cpanel = $this->cpanelConfiguration();

        $this->assertStringContainsString(
            '/bin/cp -R api/. /home/danheiex/api.danheiexpress.com/',
            $cpanel,
        );
        $this->assertStringNotContainsString('deploy-cpanel-release.sh', $cpanel);
        $this->assertStringNotContainsString('deploy-cpanel.sh', $cpanel);
        $this->assertStringNotContainsString('export ', $cpanel);
        $this->assertStringNotContainsString('timeout ', $cpanel);
        $this->assertStringNotContainsString('flock ', $cpanel);
        $this->assertStringNotContainsString('2>&1', $cpanel);
    }

    public function test_recovery_deployment_prioritizes_intake_before_legacy_and_financial_repairs(): void
    {
        $cpanel = $this->cpanelConfiguration();
        $corePosition = strpos($cpanel, '2026_07_16_140000_create_core_pickup_foundation.php');
        $schemaCheckPosition = strpos($cpanel, 'ensure-operational-intake-schema.php');
        $legacyRepairPosition = strpos($cpanel, 'repair-public-storage-link.php');
        $financialPosition = strpos($cpanel, '2026_07_16_120000_create_financial_rate_rules.php');

        $this->assertIsInt($corePosition);
        $this->assertIsInt($schemaCheckPosition);
        $this->assertIsInt($legacyRepairPosition);
        $this->assertIsInt($financialPosition);
        $this->assertTrue($corePosition < $schemaCheckPosition);
        $this->assertTrue($schemaCheckPosition < $legacyRepairPosition);
        $this->assertTrue($legacyRepairPosition < $financialPosition);
    }

    public function test_recovery_deployment_includes_every_critical_operational_migration(): void
    {
        $cpanel = $this->cpanelConfiguration();

        foreach ([
            '2026_07_16_140000_create_core_pickup_foundation.php',
            '2026_07_11_180000_create_operational_foundation_tables.php',
            '2026_07_11_181000_create_idempotency_records_table.php',
            '2026_07_12_150000_create_reconciliation_ledgers.php',
            '2026_07_12_170000_create_route_task_stops_table.php',
            '2026_07_15_100000_add_assigned_user_to_operational_tasks.php',
            '2026_07_15_101000_register_intake_permissions.php',
        ] as $migration) {
            $this->assertStringContainsString($migration, $cpanel);
        }
    }

    public function test_optional_whatsapp_and_route_index_work_cannot_block_recovery(): void
    {
        $cpanel = $this->cpanelConfiguration();

        $this->assertStringNotContainsString(
            '2026_07_07_130000_create_whatsapp_pickup_foundation_tables.php',
            $cpanel,
        );
        $this->assertStringNotContainsString('repair-route-day-index.php', $cpanel);
    }

    public function test_recovery_deployment_records_progress_and_success_with_the_checked_out_commit(): void
    {
        $repositoryRoot = dirname(__DIR__, 3);
        $cpanel = $this->cpanelConfiguration();
        $marker = $this->readFile(
            $repositoryRoot.'/api/scripts/write-cpanel-deployment-marker.php',
        );

        foreach (['schema_core', 'runtime_repairs', 'financial_schema', 'success'] as $phase) {
            $this->assertStringContainsString($phase, $cpanel);
        }

        $this->assertStringContainsString('$repositoryRoot = $argv[2]', $marker);
        $this->assertStringContainsString(
            '$gitDirectory = $repositoryRoot.\'/.git\';',
            $marker,
        );
        $this->assertStringContainsString('deploy-cpanel.last-success', $marker);
        $this->assertStringContainsString('deploy-cpanel.last-attempt', $marker);
    }

    public function test_marker_writer_resolves_loose_git_reference_and_writes_success_atomically(): void
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

            [$successExit, $successOutput] = $this->runMarker('success', $repositoryRoot, 'complete');
            $this->assertSame(0, $successExit, $successOutput);
            $this->assertStringContainsString('commit='.$commit, $this->readFile($logDirectory.'/deploy-cpanel.last-success'));
            $this->assertStringContainsString('status=success', $this->readFile($logDirectory.'/deploy-cpanel.last-success'));
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

    public function test_schema_guard_remains_compatible_with_the_existing_runtime(): void
    {
        $repositoryRoot = dirname(__DIR__, 3);
        $guard = $this->readFile(
            $repositoryRoot.'/api/scripts/ensure-operational-intake-schema.php',
        );

        $this->assertStringNotContainsString('use App\\', $guard);
        $this->assertStringContainsString(
            '2026_07_15_101000_register_intake_permissions.php',
            $guard,
        );
        $this->assertStringContainsString(
            'missing operational intake permissions',
            $guard,
        );
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
    private function runMarker(string $status, string $repositoryRoot, string $phase): array
    {
        $script = dirname(__DIR__, 2).'/scripts/write-cpanel-deployment-marker.php';
        $pipes = [];
        $process = proc_open(
            [PHP_BINARY, $script, $status, $repositoryRoot, $phase],
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
