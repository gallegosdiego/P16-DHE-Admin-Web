<?php

namespace App\Domain\Driver\Support;

use App\Domain\Driver\Models\Driver;
use App\Domain\Shared\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

class DriverDocumentAlertNotifier
{
    private const CACHE_KEY = 'driver_document_alerts:last_sync_at';

    private const LOCK_KEY = 'driver_document_alerts:sync_lock';

    public function __construct(
        private readonly DriverDocumentInspector $inspector,
    ) {
    }

    public function syncIfStale(?int $minutes = null): void
    {
        $ttlMinutes = $minutes ?? (int) config('services.notifications.driver_document_alert_sync_minutes', 30);
        $lastSync = Cache::get(self::CACHE_KEY);

        if ($lastSync && now()->diffInMinutes($lastSync) < $ttlMinutes) {
            return;
        }

        $this->sync();
    }

    /**
     * @return array<string, int>
     */
    public function sync(): array
    {
        return Cache::lock(self::LOCK_KEY, 20)->block(5, function (): array {
            $drivers = Driver::query()
                ->where('status', '!=', 'inactive')
                ->orderBy('name')
                ->get();

            $grouped = [
                'expired' => [],
                'missing' => [],
                'warning' => [],
            ];

            foreach ($drivers as $driver) {
                $documents = $this->inspector->payload($driver);
                $status = $this->inspector->status($documents);

                if (! in_array($status, ['expired', 'missing', 'warning'], true)) {
                    continue;
                }

                $grouped[$status][] = [
                    'id' => (int) $driver->id,
                    'name' => (string) $driver->name,
                    'zone' => $driver->zone,
                    'documents' => $documents,
                    'score' => $this->inspector->attentionScore($documents),
                ];
            }

            foreach ($grouped as $status => &$rows) {
                usort($rows, fn (array $left, array $right): int => $right['score'] <=> $left['score']);
            }
            unset($rows);

            $recipientIds = User::permission('drivers.view')
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values()
                ->all();

            foreach (['expired', 'missing', 'warning'] as $status) {
                $this->syncStatusNotification($status, $grouped[$status], $recipientIds);
            }

            Cache::put(self::CACHE_KEY, now(), now()->addHours(12));

            return [
                'expired' => count($grouped['expired']),
                'missing' => count($grouped['missing']),
                'warning' => count($grouped['warning']),
            ];
        });
    }

    /**
     * @param list<array{id:int,name:string,zone:?string,documents:array<string,mixed>,score:int}> $rows
     * @param list<int> $recipientIds
     */
    private function syncStatusNotification(string $status, array $rows, array $recipientIds): void
    {
        $type = "driver_documents_{$status}";

        if (count($rows) === 0) {
            Notification::query()
                ->where('type', $type)
                ->whereIn('user_id', $recipientIds)
                ->whereNull('read_at')
                ->update(['read_at' => now()]);

            return;
        }

        [$title, $body, $actionUrl, $metadata] = $this->buildNotificationContent($status, $rows);

        foreach ($recipientIds as $userId) {
            $existing = Notification::query()
                ->where('user_id', $userId)
                ->where('type', $type)
                ->whereNull('read_at')
                ->latest('id')
                ->first();

            $signature = (string) ($metadata['signature'] ?? '');
            $currentSignature = (string) data_get($existing?->metadata, 'signature', '');

            if ($existing && $currentSignature === $signature) {
                continue;
            }

            Notification::query()
                ->where('user_id', $userId)
                ->where('type', $type)
                ->whereNull('read_at')
                ->update(['read_at' => now()]);

            Notification::create([
                'user_id' => $userId,
                'type' => $type,
                'title' => $title,
                'body' => $body,
                'action_url' => $actionUrl,
                'metadata' => $metadata,
            ]);
        }
    }

    /**
     * @param list<array{id:int,name:string,zone:?string,documents:array<string,mixed>,score:int}> $rows
     * @return array{0:string,1:string,2:string,3:array<string,mixed>}
     */
    private function buildNotificationContent(string $status, array $rows): array
    {
        $topNames = collect(array_slice($rows, 0, 3))
            ->pluck('name')
            ->implode(', ');
        $driverIds = collect($rows)->pluck('id')->values()->all();
        $title = match ($status) {
            'expired' => 'Pilotos con documentos vencidos',
            'missing' => 'Pilotos con documentos faltantes',
            default => 'Pilotos con documentos por revisar',
        };
        $body = match ($status) {
            'expired' => sprintf('%d piloto(s) requieren atención inmediata. Ejemplos: %s.', count($rows), $topNames),
            'missing' => sprintf('%d piloto(s) tienen documentos pendientes de carga. Ejemplos: %s.', count($rows), $topNames),
            default => sprintf('%d piloto(s) tienen documentos por vencer o sin fecha. Ejemplos: %s.', count($rows), $topNames),
        };
        $actionUrl = "/conductores?document={$status}";
        $metadata = [
            'status' => $status,
            'severity' => $status === 'expired' ? 'danger' : ($status === 'missing' ? 'warning' : 'info'),
            'driver_ids' => $driverIds,
            'driver_count' => count($rows),
            'sample_driver_names' => collect(array_slice($rows, 0, 5))->pluck('name')->values()->all(),
            'signature' => sha1(json_encode([
                'status' => $status,
                'driver_ids' => $driverIds,
                'scores' => collect($rows)->pluck('score')->values()->all(),
            ])),
        ];

        return [$title, $body, $actionUrl, $metadata];
    }
}
