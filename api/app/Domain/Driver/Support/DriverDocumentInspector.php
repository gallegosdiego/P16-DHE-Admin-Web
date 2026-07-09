<?php

namespace App\Domain\Driver\Support;

use App\Domain\Driver\Models\Driver;
use Carbon\Carbon;

class DriverDocumentInspector
{
    public function payload(Driver $driver): array
    {
        $today = now()->startOfDay();

        $items = collect($this->documentMap())
            ->map(function (array $meta, string $key) use ($driver, $today): array {
                $url = $driver->{$meta['column']};
                $present = filled($url);
                $expiryColumn = $meta['expiry_column'] ?? null;
                $supportsExpiry = filled($expiryColumn);
                $expiresAt = $supportsExpiry && filled($driver->{$expiryColumn})
                    ? Carbon::parse((string) $driver->{$expiryColumn})->startOfDay()
                    : null;
                $daysToExpiry = $expiresAt ? $today->diffInDays($expiresAt, false) : null;
                $alertLevel = 'ok';
                $alertMessage = null;

                if (! $present) {
                    $alertLevel = 'missing';
                    $alertMessage = 'Falta cargar este documento.';
                } elseif ($supportsExpiry && ! $expiresAt) {
                    $alertLevel = 'warning';
                    $alertMessage = 'Falta registrar la fecha de vencimiento.';
                } elseif ($expiresAt && $daysToExpiry !== null && $daysToExpiry < 0) {
                    $alertLevel = 'expired';
                    $alertMessage = 'Documento vencido.';
                } elseif ($expiresAt && $daysToExpiry !== null && $daysToExpiry <= 30) {
                    $alertLevel = 'warning';
                    $alertMessage = $daysToExpiry === 0
                        ? 'Vence hoy.'
                        : "Vence en {$daysToExpiry} dias.";
                }

                return [
                    'key' => $key,
                    'label' => $meta['label'],
                    'url' => $url,
                    'present' => $present,
                    'supports_expiry' => $supportsExpiry,
                    'expires_at' => $expiresAt?->toDateString(),
                    'days_to_expiry' => $daysToExpiry,
                    'alert_level' => $alertLevel,
                    'alert_message' => $alertMessage,
                ];
            })
            ->values()
            ->all();

        $countRequired = count($items);
        $countPresent = collect($items)->where('present', true)->count();
        $countMissing = collect($items)->where('alert_level', 'missing')->count();
        $countWarning = collect($items)->where('alert_level', 'warning')->count();
        $countExpired = collect($items)->where('alert_level', 'expired')->count();

        return [
            'items' => $items,
            'count_present' => $countPresent,
            'count_required' => $countRequired,
            'completion_percent' => $countRequired > 0 ? (int) round(($countPresent / $countRequired) * 100) : 0,
            'count_missing' => $countMissing,
            'count_warning' => $countWarning,
            'count_expired' => $countExpired,
            'needs_attention_count' => $countMissing + $countWarning + $countExpired,
        ];
    }

    public function status(array $documentsPayload): string
    {
        if (($documentsPayload['count_expired'] ?? 0) > 0) {
            return 'expired';
        }

        if (($documentsPayload['count_missing'] ?? 0) > 0) {
            return 'missing';
        }

        if (($documentsPayload['count_warning'] ?? 0) > 0) {
            return 'warning';
        }

        return 'ok';
    }

    public function attentionScore(array $documentsPayload): int
    {
        return ((int) ($documentsPayload['count_expired'] ?? 0) * 100)
            + ((int) ($documentsPayload['count_missing'] ?? 0) * 70)
            + ((int) ($documentsPayload['count_warning'] ?? 0) * 35)
            + ((int) ($documentsPayload['needs_attention_count'] ?? 0) * 5);
    }

    public function documentMap(): array
    {
        return [
            'driver_license_photo' => [
                'column' => 'driver_license_photo',
                'expiry_column' => 'driver_license_expires_at',
                'label' => 'Licencia de conducción',
            ],
            'vehicle_registration_photo' => [
                'column' => 'vehicle_registration_photo',
                'label' => 'Tarjeta de propiedad',
            ],
            'soat_photo' => [
                'column' => 'soat_photo',
                'expiry_column' => 'soat_expires_at',
                'label' => 'SOAT',
            ],
            'technical_inspection_photo' => [
                'column' => 'technical_inspection_photo',
                'expiry_column' => 'technical_inspection_expires_at',
                'label' => 'Tecnomecánica',
            ],
            'national_id_front_photo' => [
                'column' => 'national_id_front_photo',
                'label' => 'Cédula frente',
            ],
            'national_id_back_photo' => [
                'column' => 'national_id_back_photo',
                'label' => 'Cédula respaldo',
            ],
        ];
    }
}
