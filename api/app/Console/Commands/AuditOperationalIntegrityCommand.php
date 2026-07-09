<?php

namespace App\Console\Commands;

use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class AuditOperationalIntegrityCommand extends Command
{
    protected $signature = 'operations:audit-integrity
        {--fix : Aplica reparaciones seguras}
        {--json : Imprime solo JSON}
        {--store-report : Guarda el reporte JSON en storage/app}
        {--report-path= : Ruta relativa opcional dentro de storage/app para guardar el reporte}
        {--date= : Fecha operativa a validar (YYYY-MM-DD), por defecto hoy}';

    protected $description = 'Audita enlaces piloto/usuario y paradas de ruta que pueden ocultar pedidos.';

    public function handle(): int
    {
        $date = $this->option('date') ?: now()->toDateString();
        $fix = (bool) $this->option('fix');
        $storeReport = (bool) $this->option('store-report');

        $before = $this->runAuditPass($date, false);
        $fixed = $this->emptyFixedCounts();
        $after = $before;

        if ($fix) {
            $fixReport = $this->runAuditPass($date, true);
            $fixed = $fixReport['fixed'];
            $after = $this->runAuditPass($date, false);
        }

        $report = [
            'date' => $date,
            'generated_at' => now()->toIso8601String(),
            'fix_applied' => $fix,
            'fixed' => $fixed,
            'summary' => $this->summarizeIssues($after['issues']),
            'issues' => $after['issues'],
        ];

        if ($fix) {
            $report['before_summary'] = $this->summarizeIssues($before['issues']);
            $report['before_issues'] = $before['issues'];
            $report['after_summary'] = $this->summarizeIssues($after['issues']);
        }

        if ($storeReport) {
            $report['stored_report_path'] = $this->storeReport($report, $date, $fix);
        }

        if ($this->option('json')) {
            $this->line(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

            return self::SUCCESS;
        }

        $this->info('Auditoria de integridad operativa');
        $this->line("Fecha operativa: {$date}");
        $this->line('Modo reparacion: ' . ($fix ? 'SI' : 'NO'));
        $this->newLine();

        foreach ($report['summary'] as $key => $count) {
            $message = "{$key}: {$count}";
            $count > 0 ? $this->warn($message) : $this->info($message);
        }

        if ($fix) {
            $this->newLine();
            $this->info('Reparaciones aplicadas:');
            foreach ($report['fixed'] as $key => $count) {
                $this->line("{$key}: {$count}");
            }
        }

        if ($storeReport && isset($report['stored_report_path'])) {
            $this->newLine();
            $this->info('Reporte guardado en: ' . $report['stored_report_path']);
        }

        return self::SUCCESS;
    }

    private function runAuditPass(string $date, bool $fix): array
    {
        $report = [
            'date' => $date,
            'fix_applied' => $fix,
            'fixed' => $this->emptyFixedCounts(),
            'issues' => $this->emptyIssueBuckets(),
        ];

        DB::transaction(function () use (&$report, $date, $fix): void {
            $this->auditDriverUsersWithoutDriverId($report, $fix);
            $this->auditDriversWithUnsyncedUser($report, $fix);
            $this->auditUsersWithUnsyncedDriver($report, $fix);
            $this->auditDuplicateUsersPerDriver($report);
            $this->auditStaleRouteStops($report, $date, $fix);
            $this->auditRouteCounters($report, $fix);
        });

        return $report;
    }

    private function summarizeIssues(array $issues): array
    {
        $summary = [];

        foreach ($issues as $key => $items) {
            $summary[$key] = count($items);
        }

        return $summary;
    }

    private function emptyFixedCounts(): array
    {
        return [
            'user_driver_links' => 0,
            'driver_user_links' => 0,
            'stale_route_stops' => 0,
            'route_counters' => 0,
        ];
    }

    private function emptyIssueBuckets(): array
    {
        return [
            'driver_users_without_driver_id' => [],
            'drivers_with_unsynced_user' => [],
            'users_with_unsynced_driver' => [],
            'duplicate_users_per_driver' => [],
            'stale_route_stops' => [],
            'route_counter_mismatches' => [],
        ];
    }

    private function storeReport(array $report, string $date, bool $fix): string
    {
        $configuredPath = trim((string) $this->option('report-path'));

        $relativePath = $configuredPath !== ''
            ? str_replace('\\', '/', ltrim($configuredPath, '/\\'))
            : sprintf(
                'operations/integrity/%s/audit-%s%s.json',
                $date,
                now()->format('His'),
                $fix ? '-fix' : ''
            );

        Storage::disk('local')->put(
            $relativePath,
            json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );

        return $relativePath;
    }

    private function auditDriverUsersWithoutDriverId(array &$report, bool $fix): void
    {
        $users = User::query()
            ->whereNull('driver_id')
            ->whereHas('roles', fn ($query) => $query->whereIn('name', ['driver', 'conductor']))
            ->get();

        foreach ($users as $user) {
            $driver = Driver::query()->where('user_id', $user->id)->first();

            $report['issues']['driver_users_without_driver_id'][] = [
                'user_id' => $user->id,
                'email' => $user->email,
                'repairable_driver_id' => $driver?->id,
            ];

            if ($fix && $driver) {
                $user->update(['driver_id' => $driver->id]);
                $report['fixed']['user_driver_links']++;
            }
        }
    }

    private function auditDriversWithUnsyncedUser(array &$report, bool $fix): void
    {
        $drivers = Driver::query()
            ->with('user:id,email,driver_id')
            ->whereNotNull('user_id')
            ->get();

        foreach ($drivers as $driver) {
            $user = $driver->user;
            if (! $user || (int) $user->driver_id === (int) $driver->id) {
                continue;
            }

            $report['issues']['drivers_with_unsynced_user'][] = [
                'driver_id' => $driver->id,
                'driver_name' => $driver->name,
                'user_id' => $driver->user_id,
                'user_driver_id' => $user->driver_id,
                'repairable' => $user->driver_id === null,
            ];

            if ($fix && $user->driver_id === null) {
                $user->update(['driver_id' => $driver->id]);
                $report['fixed']['user_driver_links']++;
            }
        }
    }

    private function auditUsersWithUnsyncedDriver(array &$report, bool $fix): void
    {
        $users = User::query()
            ->with('driver:id,name,user_id')
            ->whereNotNull('driver_id')
            ->get();

        foreach ($users as $user) {
            $driver = $user->driver;
            if (! $driver || (int) $driver->user_id === (int) $user->id) {
                continue;
            }

            $report['issues']['users_with_unsynced_driver'][] = [
                'user_id' => $user->id,
                'email' => $user->email,
                'driver_id' => $user->driver_id,
                'driver_user_id' => $driver->user_id,
                'repairable' => $driver->user_id === null,
            ];

            if ($fix && $driver->user_id === null) {
                $driver->update(['user_id' => $user->id]);
                $report['fixed']['driver_user_links']++;
            }
        }
    }

    private function auditDuplicateUsersPerDriver(array &$report): void
    {
        $duplicates = User::query()
            ->select('driver_id', DB::raw('COUNT(*) as users_count'))
            ->whereNotNull('driver_id')
            ->groupBy('driver_id')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($duplicates as $duplicate) {
            $report['issues']['duplicate_users_per_driver'][] = [
                'driver_id' => $duplicate->driver_id,
                'users_count' => (int) $duplicate->users_count,
                'user_ids' => User::query()
                    ->where('driver_id', $duplicate->driver_id)
                    ->pluck('id')
                    ->all(),
            ];
        }
    }

    private function auditStaleRouteStops(array &$report, string $date, bool $fix): void
    {
        $staleStops = DB::table('route_stops')
            ->join('routes', 'routes.id', '=', 'route_stops.route_id')
            ->join('shipments', 'shipments.id', '=', 'route_stops.shipment_id')
            ->whereNull('shipments.deleted_at')
            ->whereNotNull('shipments.driver_id')
            ->whereNotIn('shipments.status', ['delivered', 'returned', 'cancelled'])
            ->where(function ($query) use ($date): void {
                $query
                    ->whereColumn('routes.driver_id', '<>', 'shipments.driver_id')
                    ->orWhereDate('routes.route_date', '<>', $date)
                    ->orWhereNotIn('routes.status', ['planned', 'active']);
            })
            ->select([
                'route_stops.id',
                'route_stops.route_id',
                'route_stops.shipment_id',
                'routes.driver_id as route_driver_id',
                'routes.route_date',
                'routes.status as route_status',
                'shipments.driver_id as shipment_driver_id',
                'shipments.display_code',
                'shipments.status as shipment_status',
            ])
            ->get();

        foreach ($staleStops as $stop) {
            $report['issues']['stale_route_stops'][] = [
                'route_stop_id' => $stop->id,
                'route_id' => $stop->route_id,
                'shipment_id' => $stop->shipment_id,
                'display_code' => $stop->display_code,
                'route_driver_id' => $stop->route_driver_id,
                'shipment_driver_id' => $stop->shipment_driver_id,
                'route_date' => (string) $stop->route_date,
                'route_status' => $stop->route_status,
                'shipment_status' => $stop->shipment_status,
            ];
        }

        if ($fix && $staleStops->isNotEmpty()) {
            $routeIds = $staleStops->pluck('route_id')->unique()->values();
            RouteStop::query()->whereIn('id', $staleStops->pluck('id'))->delete();
            $report['fixed']['stale_route_stops'] += $staleStops->count();

            Route::query()->whereIn('id', $routeIds)->get()->each(function (Route $route) use (&$report): void {
                $route->update([
                    'total_stops' => $route->stops()->count(),
                    'completed_stops' => $route->stops()->where('status', 'completed')->count(),
                ]);
                $report['fixed']['route_counters']++;
            });
        }
    }

    private function auditRouteCounters(array &$report, bool $fix): void
    {
        $routes = Route::query()
            ->withCount([
                'stops',
                'stops as completed_stops_actual_count' => fn ($query) => $query->where('status', 'completed'),
            ])
            ->get();

        foreach ($routes as $route) {
            if (
                (int) $route->total_stops === (int) $route->stops_count
                && (int) $route->completed_stops === (int) $route->completed_stops_actual_count
            ) {
                continue;
            }

            $report['issues']['route_counter_mismatches'][] = [
                'route_id' => $route->id,
                'stored_total_stops' => (int) $route->total_stops,
                'actual_total_stops' => (int) $route->stops_count,
                'stored_completed_stops' => (int) $route->completed_stops,
                'actual_completed_stops' => (int) $route->completed_stops_actual_count,
            ];

            if ($fix) {
                $route->update([
                    'total_stops' => (int) $route->stops_count,
                    'completed_stops' => (int) $route->completed_stops_actual_count,
                ]);
                $report['fixed']['route_counters']++;
            }
        }
    }
}
