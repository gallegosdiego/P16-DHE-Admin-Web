<?php

namespace App\Console\Commands;

use App\Domain\Driver\Support\DriverDocumentAlertNotifier;
use Illuminate\Console\Command;

class SyncDriverDocumentAlertsCommand extends Command
{
    protected $signature = 'drivers:sync-document-alerts {--force : Ignora ventana de cache y fuerza resync}';

    protected $description = 'Sincroniza alertas documentales resumidas para usuarios administrativos.';

    public function handle(DriverDocumentAlertNotifier $notifier): int
    {
        $result = [];

        if ($this->option('force')) {
            $result = $notifier->sync();
        } else {
            $notifier->syncIfStale();
        }

        if ($this->option('force')) {
            $this->info(sprintf(
                'Alertas documentales sincronizadas. Vencidos: %d | Faltantes: %d | Warning: %d',
                (int) ($result['expired'] ?? 0),
                (int) ($result['missing'] ?? 0),
                (int) ($result['warning'] ?? 0),
            ));
        } else {
            $this->info('Verificación de alertas documentales ejecutada.');
        }

        return self::SUCCESS;
    }
}
