<?php

namespace App\Domain\Operations\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Verificación automática del estado de un despliegue.
 *
 * Origen: el 11 de agosto de 2026 un despliegue dejó producción con 29 de 40
 * migraciones aplicadas y cPanel lo reportó como éxito. Comprobarlo exigía
 * entrar a phpMyAdmin y ejecutar consultas a mano, así que en la práctica nadie
 * lo comprobaba.
 *
 * Este servicio convierte esas consultas en aserciones ejecutables. Lo usan:
 *  - `scripts/deploy-cpanel-all.php`, que falla el marcador si algo no cuadra;
 *  - `GET /api/deployment-health`, que un monitor externo puede vigilar.
 *
 * Añadir una comprobación aquí la propaga a ambos automáticamente.
 */
class DeploymentVerification
{
    /**
     * Columnas cuya ausencia rompe funcionalidad en runtime.
     *
     * @var array<string, list<string>>
     */
    private const REQUIRED_COLUMNS = [
        'shipments' => [
            'recipient_lat', 'recipient_lng', 'geocoded_at',
            'cod_collected_amount', 'cod_payment_method', 'cod_collected_at',
            'recipient_address_meta', 'intake_photo',
        ],
        'drivers' => [
            'last_lat', 'last_lng', 'last_location_updated_at',
            'driver_license_photo', 'soat_photo', 'driver_license_expires_at',
        ],
        'routes' => [
            'optimized_distance_meters', 'overview_polyline', 'origin_lat',
        ],
    ];

    /**
     * Nombres verificados contra el esquema real, no deducidos del nombre del
     * archivo de migración: `create_reconciliation_ledgers` no crea ninguna
     * tabla llamada así.
     *
     * @var list<string>
     */
    private const REQUIRED_TABLES = [
        'clients', 'drivers', 'shipments', 'routes', 'users',
        'pickup_requests', 'pickup_packages', 'operational_tasks',
        'driver_cod_obligations', 'driver_cod_remittances',
        'client_cod_entitlements', 'client_cod_payouts',
        'financial_rate_rules',
    ];

    /**
     * @return array{healthy: bool, failures: list<string>, checks: array<string, bool>}
     */
    public function verify(): array
    {
        $failures = [];
        $checks = [];

        $pending = $this->pendingMigrations();
        $checks['migrations_applied'] = $pending === [];
        if ($pending !== []) {
            $failures[] = count($pending).' migraciones pendientes: '.implode(', ', array_slice($pending, 0, 5));
        }

        foreach (self::REQUIRED_TABLES as $table) {
            if (! Schema::hasTable($table)) {
                $failures[] = "falta la tabla {$table}";
            }
        }
        $checks['required_tables'] = ! $this->hasFailureMatching($failures, 'falta la tabla');

        foreach (self::REQUIRED_COLUMNS as $table => $columns) {
            if (! Schema::hasTable($table)) {
                continue;
            }
            foreach ($columns as $column) {
                if (! Schema::hasColumn($table, $column)) {
                    $failures[] = "falta {$table}.{$column}";
                }
            }
        }
        $checks['required_columns'] = ! $this->hasFailureMatching($failures, 'falta shipments.')
            && ! $this->hasFailureMatching($failures, 'falta drivers.')
            && ! $this->hasFailureMatching($failures, 'falta routes.');

        $paymentTypeOk = $this->paymentTypeAcceptsMercadoLibre();
        $checks['payment_type_mercado_libre'] = $paymentTypeOk;
        if (! $paymentTypeOk) {
            $failures[] = 'shipments.payment_type no acepta mercado_libre';
        }

        $routeIndexOk = $this->routeDayIndexIsNonUnique();
        $checks['route_day_index'] = $routeIndexOk;
        if (! $routeIndexOk) {
            $failures[] = 'el índice único de rutas por día sigue presente';
        }

        return [
            'healthy' => $failures === [],
            'failures' => $failures,
            'checks' => $checks,
        ];
    }

    /**
     * @return list<string>
     */
    public function pendingMigrations(): array
    {
        $migrator = app('migrator');

        if (! $migrator->repositoryExists()) {
            return ['la tabla migrations no existe'];
        }

        $files = $migrator->getMigrationFiles([database_path('migrations')]);
        $ran = $migrator->getRepository()->getRan();

        return array_values(array_diff(array_keys($files), $ran));
    }

    /**
     * En SQLite no existen los ENUM, así que la comprobación no aplica.
     */
    private function paymentTypeAcceptsMercadoLibre(): bool
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            return true;
        }

        if (! Schema::hasColumn('shipments', 'payment_type')) {
            return false;
        }

        $row = DB::selectOne(
            'SELECT COLUMN_TYPE AS column_type FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            ['shipments', 'payment_type'],
        );

        return $row !== null && str_contains((string) $row->column_type, 'mercado_libre');
    }

    /**
     * El índice único (driver_id, route_date) impide que un piloto tenga más de
     * una ruta el mismo día. Debe haber sido sustituido por uno normal.
     */
    private function routeDayIndexIsNonUnique(): bool
    {
        if (! Schema::hasTable('routes')) {
            return false;
        }

        if (DB::connection()->getDriverName() !== 'mysql') {
            return true;
        }

        $unique = DB::select(
            "SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'routes'
                AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
                AND COLUMN_NAME IN ('driver_id', 'route_date')",
        );

        return $unique === [];
    }

    /**
     * @param  list<string>  $failures
     */
    private function hasFailureMatching(array $failures, string $needle): bool
    {
        foreach ($failures as $failure) {
            if (str_starts_with($failure, $needle)) {
                return true;
            }
        }

        return false;
    }
}
