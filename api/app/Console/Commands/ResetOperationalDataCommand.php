<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class ResetOperationalDataCommand extends Command
{
    protected $signature = 'danhei:reset-operations
        {--dry-run : Muestra el alcance sin eliminar ni actualizar datos}
        {--force : Omite la confirmacion interactiva en un ambiente permitido}
        {--json : Imprime el resultado como JSON}';

    protected $description = 'Limpia datos operativos de prueba conservando usuarios, clientes, pilotos y configuracion.';

    /**
     * El orden respeta las llaves foraneas del esquema actual.
     * Las tablas opcionales se omiten cuando sus migraciones aun no existen.
     *
     * @var array<int, string>
     */
    private const OPERATIONAL_TABLES = [
        'idempotency_records',
        'whatsapp_messages',
        'whatsapp_flow_submissions',
        'whatsapp_webhook_inbox',
        'custody_events',
        'shipment_evidence',
        'delivery_attempts',
        'pickup_batch_items',
        'pickup_batches',
        'operational_tasks',
        'pickup_review_events',
        'pickup_packages',
        'pickup_requests',
        'route_stops',
        'shipment_events',
        'shipments',
        'routes',
        'cod_settlements',
        'driver_payouts',
        'notifications',
    ];

    /** @var array<int, string> */
    private const PRESERVED_TABLES = [
        'users',
        'clients',
        'client_addresses',
        'drivers',
        'roles',
        'permissions',
        'zones',
        'pricing_rules',
        'service_locations',
        'customer_whatsapp_settings',
        'whatsapp_contacts',
        'customer_whatsapp_contacts',
    ];

    /** @var array<int, string> */
    private const OPERATIONAL_AUDIT_ENTITIES = [
        'Shipment',
        'ShipmentEvent',
        'Route',
        'RouteStop',
        'PickupRequest',
        'PickupPackage',
        'CodSettlement',
        'DriverPayout',
        'WhatsAppMessage',
        'OperationalTask',
        'PickupBatch',
        'DeliveryAttempt',
        'ShipmentEvidence',
        'CustodyEvent',
    ];

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing', 'staging'])) {
            return $this->refuseUnsafeEnvironment();
        }

        $dryRun = (bool) $this->option('dry-run');
        $before = $this->snapshot();

        if (! $dryRun && ! $this->option('force') && ! $this->confirm(
            'Se eliminaran pedidos, rutas, recogidas, recaudos y artefactos operativos. Usuarios, clientes y pilotos se conservaran. Deseas continuar?',
            false
        )) {
            $this->warn('Limpieza cancelada. No se modificaron datos.');

            return self::SUCCESS;
        }

        $deletedFiles = [];
        $reportPath = null;

        if (! $dryRun) {
            $evidencePaths = $this->evidencePaths();

            DB::transaction(function (): void {
                foreach (self::OPERATIONAL_TABLES as $table) {
                    if (Schema::hasTable($table)) {
                        DB::table($table)->delete();
                    }
                }

                if (Schema::hasTable('audit_logs')) {
                    $this->operationalAuditQuery()->delete();
                }

                $this->resetDriverOperationalState();
            });

            $deletedFiles = $this->deleteEvidenceFiles($evidencePaths);
        }

        $after = $dryRun ? $before : $this->snapshot();
        $report = [
            'environment' => app()->environment(),
            'generated_at' => now()->toIso8601String(),
            'dry_run' => $dryRun,
            'before' => $before,
            'after' => $after,
            'deleted' => $this->deletedCounts($before, $after, $dryRun),
            'files' => [
                'candidates' => $before['evidence_files'],
                'deleted' => count($deletedFiles),
            ],
            'preserved' => $after['preserved'],
        ];

        if (! $dryRun) {
            $reportPath = $this->storeReport($report);
            $report['report_path'] = $reportPath;

            Log::warning('operations.reset_completed', [
                'report_path' => $reportPath,
                'deleted' => $report['deleted'],
                'preserved' => $report['preserved'],
            ]);
        }

        $this->renderReport($report);

        return self::SUCCESS;
    }

    private function refuseUnsafeEnvironment(): int
    {
        $message = sprintf(
            'Limpieza rechazada: el ambiente "%s" no esta permitido. Solo local, testing o staging.',
            app()->environment()
        );

        if ($this->option('json')) {
            $this->line(json_encode([
                'error' => 'unsafe_environment',
                'message' => $message,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        } else {
            $this->error($message);
        }

        return self::FAILURE;
    }

    private function snapshot(): array
    {
        $tables = [];

        foreach (self::OPERATIONAL_TABLES as $table) {
            $tables[$table] = Schema::hasTable($table)
                ? DB::table($table)->count()
                : null;
        }

        $preserved = [];
        foreach (self::PRESERVED_TABLES as $table) {
            $preserved[$table] = Schema::hasTable($table)
                ? DB::table($table)->count()
                : null;
        }

        return [
            'tables' => $tables,
            'operational_audit_logs' => Schema::hasTable('audit_logs')
                ? $this->operationalAuditQuery()->count()
                : null,
            'drivers_to_reset' => $this->driversToResetCount(),
            'evidence_files' => count($this->evidencePaths()),
            'preserved' => $preserved,
        ];
    }

    private function operationalAuditQuery(): Builder
    {
        return DB::table('audit_logs')->where(function (Builder $query): void {
            $query
                ->whereIn('entity_type', self::OPERATIONAL_AUDIT_ENTITIES)
                ->orWhere('action', 'like', 'financial.%')
                ->orWhere('action', 'like', 'whatsapp.pickup%')
                ->orWhere('action', 'like', 'shipment.%')
                ->orWhere('action', 'like', 'route.%')
                ->orWhere('action', 'like', 'operations.%');
        });
    }

    private function driversToResetCount(): int
    {
        if (! Schema::hasTable('drivers')) {
            return 0;
        }

        $query = DB::table('drivers')->where('status', '<>', 'active');

        foreach (['last_lat', 'last_lng', 'last_heading', 'last_speed', 'last_location_updated_at'] as $column) {
            if (Schema::hasColumn('drivers', $column)) {
                $query->orWhereNotNull($column);
            }
        }

        return $query->count();
    }

    private function resetDriverOperationalState(): void
    {
        if (! Schema::hasTable('drivers')) {
            return;
        }

        $updates = ['status' => 'active'];

        foreach (['last_lat', 'last_lng', 'last_heading', 'last_speed', 'last_location_updated_at'] as $column) {
            if (Schema::hasColumn('drivers', $column)) {
                $updates[$column] = null;
            }
        }

        DB::table('drivers')->update($updates);
    }

    /** @return array<int, string> */
    private function evidencePaths(): array
    {
        $paths = [];

        if (Schema::hasTable('shipments')) {
            foreach (['evidence_photo', 'intake_photo'] as $column) {
                if (! Schema::hasColumn('shipments', $column)) {
                    continue;
                }

                foreach (DB::table('shipments')->whereNotNull($column)->pluck($column) as $value) {
                    $path = $this->normalizeEvidencePath((string) $value);
                    if ($path !== null) {
                        $paths[] = $path;
                    }
                }
            }
        }

        if (Schema::hasTable('shipment_evidence')) {
            foreach (['original_path', 'sealed_path'] as $column) {
                foreach (DB::table('shipment_evidence')->whereNotNull($column)->pluck($column) as $value) {
                    $path = $this->normalizeEvidencePath((string) $value);
                    if ($path !== null) {
                        $paths[] = $path;
                    }
                }
            }
        }

        return array_values(array_unique($paths));
    }

    private function normalizeEvidencePath(string $value): ?string
    {
        $path = parse_url($value, PHP_URL_PATH) ?: $value;
        $path = str_replace('\\', '/', ltrim($path, '/'));

        foreach (['evidence/', 'intake/', 'operations/evidence/'] as $allowedPrefix) {
            $position = strpos($path, $allowedPrefix);
            if ($position !== false) {
                return substr($path, $position);
            }
        }

        return null;
    }

    /**
     * @param  array<int, string>  $paths
     * @return array<int, string>
     */
    private function deleteEvidenceFiles(array $paths): array
    {
        $deleted = [];
        $disk = Storage::disk('public');

        foreach ($paths as $path) {
            if ($disk->exists($path) && $disk->delete($path)) {
                $deleted[] = $path;
            }
        }

        return $deleted;
    }

    private function deletedCounts(array $before, array $after, bool $dryRun): array
    {
        $deleted = [];

        foreach ($before['tables'] as $table => $count) {
            $afterCount = $after['tables'][$table];
            $deleted[$table] = $count === null
                ? null
                : ($dryRun ? $count : max(0, $count - (int) $afterCount));
        }

        $beforeAudit = $before['operational_audit_logs'];
        $afterAudit = $after['operational_audit_logs'];
        $deleted['operational_audit_logs'] = $beforeAudit === null
            ? null
            : ($dryRun ? $beforeAudit : max(0, $beforeAudit - (int) $afterAudit));

        return $deleted;
    }

    private function storeReport(array $report): string
    {
        $path = sprintf('operations/resets/reset-%s.json', now()->format('Ymd-His-u'));

        Storage::disk('local')->put(
            $path,
            json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );

        return $path;
    }

    private function renderReport(array $report): void
    {
        if ($this->option('json')) {
            $this->line(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

            return;
        }

        $this->info($report['dry_run'] ? 'Vista previa de limpieza operativa' : 'Limpieza operativa completada');
        $this->line('Ambiente: '.$report['environment']);
        $this->newLine();

        $rows = [];
        foreach ($report['deleted'] as $table => $count) {
            $rows[] = [$table, $count === null ? 'no instalada' : (string) $count];
        }

        $this->table(['Recurso', $report['dry_run'] ? 'Se eliminaria' : 'Eliminado'], $rows);
        $this->line('Archivos de evidencia: '.$report['files']['deleted'].' / '.$report['files']['candidates']);
        $this->line('Usuarios conservados: '.($report['preserved']['users'] ?? 0));
        $this->line('Clientes conservados: '.($report['preserved']['clients'] ?? 0));
        $this->line('Pilotos conservados: '.($report['preserved']['drivers'] ?? 0));

        if (isset($report['report_path'])) {
            $this->line('Reporte: '.$report['report_path']);
        }
    }
}
