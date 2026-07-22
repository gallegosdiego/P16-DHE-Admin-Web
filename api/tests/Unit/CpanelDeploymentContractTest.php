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

    public function test_deployment_has_at_most_five_tasks(): void
    {
        $cpanel = $this->cpanelConfiguration();

        preg_match_all('/^\s+-\s+/m', $cpanel, $matches);
        $taskCount = count($matches[0]);

        $this->assertLessThanOrEqual(5, $taskCount,
            "The .cpanel.yml should have at most 5 tasks to avoid task runner timeouts. Found {$taskCount}.",
        );
    }

    public function test_consolidated_script_exists_and_covers_all_critical_phases(): void
    {
        $script = $this->readFile(
            dirname(__DIR__, 2).'/scripts/deploy-cpanel-all.php',
        );

        // Must cover all three deployment phases.
        foreach (['schema_core', 'runtime_repairs', 'financial_schema'] as $phase) {
            $this->assertStringContainsString($phase, $script);
        }

        // Must include all critical operational migrations.
        foreach ([
            '2026_07_16_140000_create_core_pickup_foundation.php',
            '2026_07_11_180000_create_operational_foundation_tables.php',
            '2026_07_11_181000_create_idempotency_records_table.php',
            '2026_07_12_150000_create_reconciliation_ledgers.php',
            '2026_07_12_170000_create_route_task_stops_table.php',
            '2026_07_15_100000_add_assigned_user_to_operational_tasks.php',
            '2026_07_15_101000_register_intake_permissions.php',
        ] as $migration) {
            $this->assertStringContainsString($migration, $script);
        }

        // Must include financial migrations.
        foreach ([
            '2026_07_16_120000_create_financial_rate_rules.php',
            '2026_07_16_130000_add_financial_receipts_reversals_and_opening.php',
        ] as $migration) {
            $this->assertStringContainsString($migration, $script);
        }

        // Must include repair scripts.
        foreach ([
            'repair-public-storage-link.php',
            'repair-cod-schema.php',
            'repair-driver-mobile-geo-schema.php',
            'repair-driver-documents-schema.php',
        ] as $repairScript) {
            $this->assertStringContainsString($repairScript, $script);
        }

        // Must include schema verification.
        $this->assertStringContainsString('ensure-operational-intake-schema.php', $script);
        $this->assertStringContainsString('repair-operational-intake-schema.php', $script);
    }

    public function test_consolidated_script_uses_error_handling_to_avoid_hanging(): void
    {
        $script = $this->readFile(
            dirname(__DIR__, 2).'/scripts/deploy-cpanel-all.php',
        );

        // Must use try/catch to prevent hanging on errors.
        $this->assertStringContainsString('try {', $script);
        $this->assertStringContainsString('catch', $script);

        // Must always exit(0) so cPanel updates the deployed SHA.
        $this->assertStringContainsString('exit(0)', $script);
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

