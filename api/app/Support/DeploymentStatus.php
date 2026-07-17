<?php

namespace App\Support;

use DateTimeImmutable;

class DeploymentStatus
{
    public function __construct(private readonly ?string $logDirectory = null) {}

    /**
     * @return array{
     *     status: 'success'|'failed'|'running'|'unknown',
     *     commit: ?string,
     *     started_at: ?string,
     *     completed_at: ?string,
     *     failed_at: ?string,
     *     phase: ?string,
     *     exit_code: ?int
     * }
     */
    public function snapshot(): array
    {
        $directory = $this->logDirectory ?? storage_path('logs');
        $success = $this->readMarker($directory.'/deploy-cpanel.last-success');
        $failure = $this->readMarker($directory.'/deploy-cpanel.last-failure');
        $attempt = $this->readMarker($directory.'/deploy-cpanel.last-attempt');

        $selected = $this->latestMarker([
            'success' => $success,
            'failed' => $failure,
            'running' => $attempt,
        ]);

        if ($selected === null) {
            return $this->emptySnapshot();
        }

        [$fallbackStatus, $marker] = $selected;
        $status = $this->normalizedStatus($marker['status'] ?? $fallbackStatus);

        return [
            'status' => $status,
            'commit' => $this->safeString($marker['commit'] ?? null),
            'started_at' => $this->safeString($marker['started_at'] ?? null),
            'completed_at' => $this->safeString($marker['completed_at'] ?? null),
            'failed_at' => $this->safeString($marker['failed_at'] ?? null),
            'phase' => $this->safeString($marker['phase'] ?? null),
            'exit_code' => isset($marker['exit_code']) && is_numeric($marker['exit_code'])
                ? (int) $marker['exit_code']
                : null,
        ];
    }

    /**
     * @return array<string, string>
     */
    public static function parseMarker(string $contents): array
    {
        $values = [];

        foreach (preg_split('/\R/', $contents) ?: [] as $line) {
            if (! str_contains($line, '=')) {
                continue;
            }

            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);

            if ($key === '' || ! preg_match('/^[a-z_]+$/', $key)) {
                continue;
            }

            $values[$key] = trim($value);
        }

        return $values;
    }

    /**
     * @return array{data: array<string, string>, timestamp: int}|null
     */
    private function readMarker(string $path): ?array
    {
        if (! is_file($path) || ! is_readable($path)) {
            return null;
        }

        $contents = file_get_contents($path);
        if ($contents === false) {
            return null;
        }

        $data = self::parseMarker($contents);
        if ($data === []) {
            return null;
        }

        return [
            'data' => $data,
            'timestamp' => $this->markerTimestamp($data, (int) (filemtime($path) ?: 0)),
        ];
    }

    /**
     * @param  array<string, array{data: array<string, string>, timestamp: int}|null>  $markers
     * @return array{string, array<string, string>}|null
     */
    private function latestMarker(array $markers): ?array
    {
        $latestStatus = null;
        $latestMarker = null;

        foreach ($markers as $status => $marker) {
            if ($marker === null) {
                continue;
            }

            if ($latestMarker === null || $marker['timestamp'] > $latestMarker['timestamp']) {
                $latestStatus = $status;
                $latestMarker = $marker;
            }
        }

        return $latestStatus !== null && $latestMarker !== null
            ? [$latestStatus, $latestMarker['data']]
            : null;
    }

    /**
     * @param  array<string, string>  $marker
     */
    private function markerTimestamp(array $marker, int $fallback): int
    {
        foreach (['completed_at', 'failed_at', 'started_at'] as $key) {
            $value = $marker[$key] ?? null;

            if (! is_string($value) || trim($value) === '') {
                continue;
            }

            try {
                return (new DateTimeImmutable($value))->getTimestamp();
            } catch (\Throwable) {
                // Un marcador malformado no debe romper el diagnóstico del API.
            }
        }

        return $fallback;
    }

    private function normalizedStatus(string $status): string
    {
        return in_array($status, ['success', 'failed', 'running'], true)
            ? $status
            : 'unknown';
    }

    private function safeString(mixed $value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return mb_substr(trim($value), 0, 180);
    }

    /**
     * @return array{status: 'unknown', commit: null, started_at: null, completed_at: null, failed_at: null, phase: null, exit_code: null}
     */
    private function emptySnapshot(): array
    {
        return [
            'status' => 'unknown',
            'commit' => null,
            'started_at' => null,
            'completed_at' => null,
            'failed_at' => null,
            'phase' => null,
            'exit_code' => null,
        ];
    }
}
