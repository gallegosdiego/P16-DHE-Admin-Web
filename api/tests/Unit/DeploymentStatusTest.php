<?php

namespace Tests\Unit;

use App\Support\DeploymentStatus;
use PHPUnit\Framework\TestCase;

class DeploymentStatusTest extends TestCase
{
    public function test_marker_parser_ignores_invalid_lines_and_preserves_values_after_equals(): void
    {
        $marker = DeploymentStatus::parseMarker(implode("\n", [
            'commit=abc123',
            'status=failed',
            'phase=run migrations = operational intake',
            'INVALID KEY=ignored',
            'line-without-value',
        ]));

        $this->assertSame('abc123', $marker['commit']);
        $this->assertSame('failed', $marker['status']);
        $this->assertSame('run migrations = operational intake', $marker['phase']);
        $this->assertArrayNotHasKey('INVALID KEY', $marker);
    }

    public function test_snapshot_exposes_latest_failure_without_paths_or_log_contents(): void
    {
        $directory = sys_get_temp_dir().'/danhei-deployment-status-'.bin2hex(random_bytes(6));
        mkdir($directory, 0700, true);

        try {
            file_put_contents($directory.'/deploy-cpanel.last-success', implode("\n", [
                'commit=old-success',
                'completed_at=2026-07-17 09:00:00 -0500',
                'status=success',
            ]));
            file_put_contents($directory.'/deploy-cpanel.last-failure', implode("\n", [
                'commit=new-failure',
                'failed_at=2026-07-17 10:00:00 -0500',
                'status=failed',
                'phase=pre-migrate operational foundation',
                'exit_code=1',
            ]));

            $snapshot = (new DeploymentStatus($directory))->snapshot();

            $this->assertSame('failed', $snapshot['status']);
            $this->assertSame('new-failure', $snapshot['commit']);
            $this->assertSame('pre-migrate operational foundation', $snapshot['phase']);
            $this->assertSame(1, $snapshot['exit_code']);
            $this->assertArrayNotHasKey('path', $snapshot);
            $this->assertArrayNotHasKey('log', $snapshot);
        } finally {
            foreach (glob($directory.'/*') ?: [] as $path) {
                unlink($path);
            }
            rmdir($directory);
        }
    }
}
