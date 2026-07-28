<?php

namespace App\Support;

use RuntimeException;

final class CpanelDeploymentMarker
{
    public function __construct(
        private readonly string $repositoryRoot,
        private readonly string $logDirectory,
    ) {}

    /**
     * @return array<string, string>
     */
    public function running(string $phase): array
    {
        return $this->writeStatus('running', $phase);
    }

    /**
     * @return array<string, string>
     */
    public function success(string $phase = 'complete'): array
    {
        return $this->writeStatus('success', $phase);
    }

    /**
     * @return array<string, string>
     */
    public function failed(string $phase, int $exitCode = 1): array
    {
        return $this->writeStatus('failed', $phase, max(1, $exitCode));
    }

    /**
     * @return array<string, string>
     */
    private function writeStatus(string $status, string $phase, ?int $exitCode = null): array
    {
        if (! in_array($status, ['running', 'success', 'failed'], true)) {
            throw new RuntimeException('Unsupported deployment marker status.');
        }

        $commit = $this->resolveGitCommit();
        $timestamp = date('Y-m-d H:i:s O');
        $phase = preg_replace('/[^a-zA-Z0-9_.-]+/', '_', $phase) ?: 'unknown';

        $attempt = [
            'commit' => $commit,
            'started_at' => $timestamp,
            'status' => $status,
            'phase' => $phase,
        ];

        if ($status === 'success') {
            $attempt['completed_at'] = $timestamp;
        } elseif ($status === 'failed') {
            $attempt['failed_at'] = $timestamp;
            $attempt['exit_code'] = (string) ($exitCode ?? 1);
        }

        $this->ensureLogDirectory();
        $this->writeMarker($this->logDirectory.'/deploy-cpanel.last-attempt', $attempt);

        if ($status === 'success') {
            $this->writeMarker($this->logDirectory.'/deploy-cpanel.last-success', [
                'commit' => $commit,
                'completed_at' => $timestamp,
                'status' => 'success',
                'phase' => $phase,
            ]);
            $this->removeMarker($this->logDirectory.'/deploy-cpanel.last-failure');
        } elseif ($status === 'failed') {
            $this->writeMarker($this->logDirectory.'/deploy-cpanel.last-failure', [
                'commit' => $commit,
                'failed_at' => $timestamp,
                'status' => 'failed',
                'phase' => $phase,
                'exit_code' => (string) ($exitCode ?? 1),
            ]);
        }

        return $attempt;
    }

    private function resolveGitCommit(): string
    {
        $gitDirectory = $this->repositoryRoot.'/.git';
        $head = $this->readTrimmed($gitDirectory.'/HEAD');

        if ($head === null) {
            throw new RuntimeException('cPanel repository HEAD is unavailable.');
        }

        if (preg_match('/^[0-9a-f]{40}$/i', $head) === 1) {
            return strtolower($head);
        }

        if (! str_starts_with($head, 'ref: ')) {
            throw new RuntimeException('cPanel repository HEAD is invalid.');
        }

        $reference = trim(substr($head, 5));
        if ($reference === '' || str_contains($reference, '..')) {
            throw new RuntimeException('cPanel repository reference is invalid.');
        }

        $looseReference = $this->readTrimmed($gitDirectory.'/'.$reference);
        if ($looseReference !== null && preg_match('/^[0-9a-f]{40}$/i', $looseReference) === 1) {
            return strtolower($looseReference);
        }

        $packedReferences = @file($gitDirectory.'/packed-refs', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($packedReferences ?: [] as $line) {
            if ($line[0] === '#' || $line[0] === '^') {
                continue;
            }

            [$commit, $packedReference] = array_pad(preg_split('/\s+/', trim($line), 2) ?: [], 2, null);
            if ($packedReference === $reference
                && is_string($commit)
                && preg_match('/^[0-9a-f]{40}$/i', $commit) === 1
            ) {
                return strtolower($commit);
            }
        }

        throw new RuntimeException('Unable to resolve the cPanel repository commit.');
    }

    private function ensureLogDirectory(): void
    {
        if (! is_dir($this->logDirectory)
            && ! mkdir($this->logDirectory, 0775, true)
            && ! is_dir($this->logDirectory)
        ) {
            throw new RuntimeException('Unable to create the deployment marker directory.');
        }
    }

    private function readTrimmed(string $path): ?string
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
    private function writeMarker(string $path, array $values): void
    {
        $contents = '';
        foreach ($values as $key => $value) {
            $contents .= $key.'='.$value.PHP_EOL;
        }

        $temporaryPath = $path.'.tmp-'.bin2hex(random_bytes(4));
        if (file_put_contents($temporaryPath, $contents, LOCK_EX) === false
            || ! rename($temporaryPath, $path)
        ) {
            @unlink($temporaryPath);
            throw new RuntimeException("Unable to write deployment marker {$path}.");
        }
    }

    private function removeMarker(string $path): void
    {
        if (is_file($path) && ! unlink($path)) {
            throw new RuntimeException("Unable to remove deployment marker {$path}.");
        }
    }
}
