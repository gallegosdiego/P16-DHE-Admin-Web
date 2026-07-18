<?php

declare(strict_types=1);

$allowedStatuses = ['running', 'success'];
$status = $argv[1] ?? '';
$repositoryRoot = $argv[2] ?? '';
$phase = $argv[3] ?? 'unknown';

if (! in_array($status, $allowedStatuses, true)) {
    fwrite(STDERR, 'ERROR: marker status must be running or success.'.PHP_EOL);
    exit(2);
}

if ($repositoryRoot === '' || ! is_dir($repositoryRoot.'/.git')) {
    fwrite(STDERR, 'ERROR: cPanel repository root is unavailable.'.PHP_EOL);
    exit(2);
}

$commit = resolveGitCommit($repositoryRoot);
if ($commit === null) {
    fwrite(STDERR, 'ERROR: unable to resolve the cPanel repository commit.'.PHP_EOL);
    exit(2);
}

$phase = preg_replace('/[^a-zA-Z0-9_.-]+/', '_', $phase) ?: 'unknown';
$logDirectory = getenv('DANHEI_MARKER_LOG_DIRECTORY') ?: dirname(__DIR__).'/storage/logs';

if (! is_dir($logDirectory) && ! mkdir($logDirectory, 0775, true) && ! is_dir($logDirectory)) {
    fwrite(STDERR, 'ERROR: unable to create the deployment marker directory.'.PHP_EOL);
    exit(2);
}

$timestamp = date('Y-m-d H:i:s O');
$attempt = [
    'commit' => $commit,
    'started_at' => $timestamp,
    'status' => $status,
    'phase' => $phase,
];

if ($status === 'success') {
    $attempt['completed_at'] = $timestamp;
}

writeMarker($logDirectory.'/deploy-cpanel.last-attempt', $attempt);

if ($status === 'success') {
    writeMarker($logDirectory.'/deploy-cpanel.last-success', [
        'commit' => $commit,
        'completed_at' => $timestamp,
        'status' => 'success',
        'phase' => $phase,
    ]);

    $failureMarker = $logDirectory.'/deploy-cpanel.last-failure';
    if (is_file($failureMarker)) {
        unlink($failureMarker);
    }
}

echo "OK: deployment marker {$status} for {$commit} at {$phase}.".PHP_EOL;

function resolveGitCommit(string $repositoryRoot): ?string
{
    $gitDirectory = $repositoryRoot.'/.git';
    $head = readTrimmed($gitDirectory.'/HEAD');

    if ($head === null) {
        return null;
    }

    if (preg_match('/^[0-9a-f]{40}$/i', $head) === 1) {
        return strtolower($head);
    }

    if (! str_starts_with($head, 'ref: ')) {
        return null;
    }

    $reference = trim(substr($head, 5));
    if ($reference === '' || str_contains($reference, '..')) {
        return null;
    }

    $looseReference = readTrimmed($gitDirectory.'/'.$reference);
    if ($looseReference !== null && preg_match('/^[0-9a-f]{40}$/i', $looseReference) === 1) {
        return strtolower($looseReference);
    }

    $packedReferences = @file($gitDirectory.'/packed-refs', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($packedReferences ?: [] as $line) {
        if ($line[0] === '#' || $line[0] === '^') {
            continue;
        }

        [$commit, $packedReference] = array_pad(preg_split('/\s+/', trim($line), 2) ?: [], 2, null);
        if ($packedReference === $reference && is_string($commit) && preg_match('/^[0-9a-f]{40}$/i', $commit) === 1) {
            return strtolower($commit);
        }
    }

    return null;
}

function readTrimmed(string $path): ?string
{
    if (! is_file($path) || ! is_readable($path)) {
        return null;
    }

    $contents = file_get_contents($path);

    return $contents === false ? null : trim($contents);
}

/**
 * @param  array<string, string>  $values
 */
function writeMarker(string $path, array $values): void
{
    $contents = '';
    foreach ($values as $key => $value) {
        $contents .= $key.'='.$value.PHP_EOL;
    }

    $temporaryPath = $path.'.tmp-'.bin2hex(random_bytes(4));
    if (file_put_contents($temporaryPath, $contents, LOCK_EX) === false || ! rename($temporaryPath, $path)) {
        @unlink($temporaryPath);
        fwrite(STDERR, "ERROR: unable to write deployment marker {$path}.".PHP_EOL);
        exit(2);
    }
}
