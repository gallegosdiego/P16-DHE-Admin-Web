<?php

declare(strict_types=1);

use App\Support\CpanelDeploymentMarker;

require __DIR__.'/../vendor/autoload.php';

$status = $argv[1] ?? '';
$repositoryRoot = $argv[2] ?? '';
$phase = $argv[3] ?? 'unknown';
$exitCode = isset($argv[4]) && is_numeric($argv[4]) ? (int) $argv[4] : 1;
$logDirectory = getenv('DANHEI_MARKER_LOG_DIRECTORY') ?: dirname(__DIR__).'/storage/logs';

if ($repositoryRoot === '' || ! is_dir($repositoryRoot.'/.git')) {
    fwrite(STDERR, 'ERROR: cPanel repository root is unavailable.'.PHP_EOL);
    exit(2);
}

try {
    $marker = new CpanelDeploymentMarker($repositoryRoot, $logDirectory);
    $values = match ($status) {
        'running' => $marker->running($phase),
        'success' => $marker->success($phase),
        'failed' => $marker->failed($phase, $exitCode),
        default => throw new RuntimeException('Marker status must be running, success or failed.'),
    };

    echo "OK: deployment marker {$values['status']} for {$values['commit']} at {$values['phase']}.".PHP_EOL;
    exit(0);
} catch (Throwable $exception) {
    fwrite(STDERR, 'ERROR: '.$exception->getMessage().PHP_EOL);
    exit(2);
}
