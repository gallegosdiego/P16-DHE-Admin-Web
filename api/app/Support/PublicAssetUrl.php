<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PublicAssetUrl
{
    public static function toPublicUrl(?string $value): ?string
    {
        $trimmed = trim((string) $value);

        if ($trimmed === '') {
            return null;
        }

        if (Str::startsWith($trimmed, ['data:', 'blob:'])) {
            return $trimmed;
        }

        $storedPath = self::toStoredPath($trimmed);

        if ($storedPath === null) {
            return $trimmed;
        }

        return rtrim(self::publicBaseUrl(), '/').'/storage/'.$storedPath;
    }

    public static function toStoredPath(?string $value): ?string
    {
        $trimmed = trim((string) $value);

        if ($trimmed === '' || Str::startsWith($trimmed, ['data:', 'blob:'])) {
            return null;
        }

        if (filter_var($trimmed, FILTER_VALIDATE_URL)) {
            $parsedPath = parse_url($trimmed, PHP_URL_PATH);

            if (! is_string($parsedPath) || $parsedPath === '') {
                return null;
            }

            $trimmed = $parsedPath;
        }

        $normalized = ltrim($trimmed, '/');

        if ($normalized === '') {
            return null;
        }

        if (Str::startsWith($normalized, 'storage/')) {
            $normalized = Str::after($normalized, 'storage/');
        }

        if (Str::startsWith($normalized, 'public/')) {
            $normalized = Str::after($normalized, 'public/');
        }

        $normalized = trim($normalized, '/');

        return $normalized !== '' ? $normalized : null;
    }

    private static function publicBaseUrl(): string
    {
        $request = app()->bound('request') ? app('request') : null;

        if ($request instanceof Request) {
            $root = rtrim($request->getSchemeAndHttpHost().$request->getBaseUrl(), '/');

            if ($root !== '' && ! self::isLocalHost($root)) {
                return $root;
            }
        }

        $configuredPublicUrl = trim((string) config('filesystems.disks.public.url', ''));
        if ($configuredPublicUrl !== '') {
            $base = preg_replace('#/storage/?$#', '', $configuredPublicUrl) ?: $configuredPublicUrl;

            if (! self::isLocalHost($base)) {
                return rtrim($base, '/');
            }
        }

        $appUrl = trim((string) config('app.url', ''));
        if ($appUrl !== '') {
            return rtrim($appUrl, '/');
        }

        if ($request instanceof Request) {
            return rtrim($request->getSchemeAndHttpHost().$request->getBaseUrl(), '/');
        }

        return 'http://localhost';
    }

    private static function isLocalHost(string $url): bool
    {
        $host = parse_url($url, PHP_URL_HOST);

        if (! is_string($host) || $host === '') {
            return false;
        }

        return in_array(strtolower($host), ['127.0.0.1', 'localhost'], true);
    }
}
