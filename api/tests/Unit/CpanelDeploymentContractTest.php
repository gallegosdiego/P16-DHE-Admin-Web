<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class CpanelDeploymentContractTest extends TestCase
{
    public function test_cpanel_deployment_prepares_schema_before_copying_application_code(): void
    {
        $repositoryRoot = dirname(__DIR__, 3);
        $cpanel = $this->readFile($repositoryRoot.'/.cpanel.yml');
        $release = $this->readFile($repositoryRoot.'/api/scripts/deploy-cpanel-release.sh');

        $this->assertStringContainsString(
            'api/scripts/deploy-cpanel-release.sh',
            $cpanel,
        );
        $this->assertStringNotContainsString(
            '/bin/cp -R api/. /home/danheiex/api.danheiexpress.com/',
            $cpanel,
        );

        $schemaPosition = strpos(
            $release,
            'guarantee operational intake schema before code copy',
        );
        $copyPosition = strpos(
            $release,
            'copy application files for commit',
        );

        $this->assertIsInt($schemaPosition);
        $this->assertIsInt($copyPosition);
        $this->assertTrue(
            $schemaPosition < $copyPosition,
            'The schema guarantee must run before the application copy.',
        );
        $this->assertStringContainsString(
            '2026_07_16_140000_create_core_pickup_foundation.php',
            $release,
        );
        $this->assertStringContainsString(
            'ensure-operational-intake-schema.php',
            $release,
        );
        $this->assertStringContainsString(
            'deploy-cpanel.last-success',
            $release,
        );
    }

    public function test_whatsapp_remains_outside_the_pre_copy_critical_path(): void
    {
        $repositoryRoot = dirname(__DIR__, 3);
        $release = $this->readFile($repositoryRoot.'/api/scripts/deploy-cpanel-release.sh');
        $runtime = $this->readFile($repositoryRoot.'/api/scripts/deploy-cpanel.sh');

        $this->assertStringNotContainsString(
            '2026_07_07_130000_create_whatsapp_pickup_foundation_tables.php',
            $release,
        );
        $this->assertStringContainsString(
            'run_optional_step',
            $runtime,
        );
        $this->assertStringContainsString(
            'migrate isolated WhatsApp pickup integration',
            $runtime,
        );
    }

    public function test_release_orchestrator_transfers_lock_and_log_ownership(): void
    {
        $repositoryRoot = dirname(__DIR__, 3);
        $release = $this->readFile($repositoryRoot.'/api/scripts/deploy-cpanel-release.sh');
        $runtime = $this->readFile($repositoryRoot.'/api/scripts/deploy-cpanel.sh');

        foreach ([
            'DANHEI_DEPLOY_LOCK_HELD=1',
            'DANHEI_DEPLOY_LOG_INHERITED=1',
            'DANHEI_DEPLOY_COMMIT=${SOURCE_COMMIT}',
        ] as $expected) {
            $this->assertStringContainsString($expected, $release);
        }

        $this->assertStringContainsString('DANHEI_DEPLOY_LOCK_HELD', $runtime);
        $this->assertStringContainsString('DANHEI_DEPLOY_LOG_INHERITED', $runtime);
        $this->assertStringContainsString('DANHEI_DEPLOY_COMMIT', $runtime);
    }

    public function test_runtime_deploy_cannot_put_legacy_repairs_before_intake_schema(): void
    {
        $repositoryRoot = dirname(__DIR__, 3);
        $runtime = $this->readFile($repositoryRoot.'/api/scripts/deploy-cpanel.sh');

        $corePosition = strpos($runtime, 'migrate isolated core pickup foundation');
        $schemaPosition = strpos($runtime, 'verify operational intake schema contract');
        $legacyRepairPosition = strpos($runtime, 'REPAIR_SCRIPTS=(');

        $this->assertIsInt($corePosition);
        $this->assertIsInt($schemaPosition);
        $this->assertIsInt($legacyRepairPosition);
        $this->assertTrue(
            $corePosition < $schemaPosition,
            'The core migration must run before the schema verification.',
        );
        $this->assertTrue(
            $schemaPosition < $legacyRepairPosition,
            'Legacy repairs must not block the intake schema.',
        );
    }

    public function test_pre_copy_schema_guard_is_compatible_with_the_existing_runtime(): void
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

        foreach ([
            '2026_07_16_140000_create_core_pickup_foundation.php',
            '2026_07_11_180000_create_operational_foundation_tables.php',
            '2026_07_11_181000_create_idempotency_records_table.php',
            '2026_07_15_100000_add_assigned_user_to_operational_tasks.php',
            '2026_07_15_101000_register_intake_permissions.php',
        ] as $migration) {
            $contents = $this->readFile(
                $repositoryRoot.'/api/database/migrations/'.$migration,
            );
            $this->assertStringNotContainsString(
                'use App\\',
                $contents,
                "{$migration} must remain executable by the previous runtime.",
            );
        }
    }

    private function readFile(string $path): string
    {
        $contents = file_get_contents($path);
        $this->assertIsString($contents, "Unable to read {$path}");

        return $contents;
    }
}
