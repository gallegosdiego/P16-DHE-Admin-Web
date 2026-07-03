<?php

namespace App\Domain\Driver\Services;

use App\Domain\Shipment\Models\Route;
use App\Domain\Shipment\Models\RouteStop;
use App\Domain\Shipment\Models\Shipment;
use BackedEnum;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class DriverHistoryService
{
    public function paginateByDriver(int $driverId, int $perPage = 12, int $page = 1): array
    {
        $perPage = max(1, min($perPage, 20));
        $page = max(1, $page);

        $historyRoutesQuery = Route::query()
            ->where('driver_id', $driverId)
            ->where(function ($query) {
                $query->where('total_stops', '>', 0)
                    ->orWhere('completed_stops', '>', 0);
            });

        $paginator = (clone $historyRoutesQuery)
            ->selectRaw('DATE(route_date) as route_date')
            ->groupBy('route_date')
            ->orderByDesc('route_date')
            ->paginate($perPage, ['route_date'], 'page', $page);

        $historySummary = $this->buildDriverHistorySummaryByDriverId($driverId);

        $dates = collect($paginator->items())
            ->pluck('route_date')
            ->map(fn ($date) => Carbon::parse((string) $date)->toDateString())
            ->values()
            ->all();

        if ($dates === []) {
            return [
                'data' => [],
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'summary' => $historySummary,
            ];
        }

        $routesByDate = collect(Route::query()
            ->with(['stops.shipment'])
            ->where('driver_id', $driverId)
            ->whereDate('route_date', '>=', min($dates))
            ->whereDate('route_date', '<=', max($dates))
            ->where(function ($query) {
                $query->where('total_stops', '>', 0)
                    ->orWhere('completed_stops', '>', 0);
            })
            ->orderByDesc('route_date')
            ->orderBy('created_at')
            ->get()
            ->groupBy(fn (Route $route) => $route->route_date->toDateString())
            ->all())->only($dates);

        $data = collect($dates)
            ->map(fn (string $date) => $this->buildSummaryEntry($date, $routesByDate->get($date, collect())))
            ->values()
            ->all();

        return [
            'data' => $data,
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'summary' => $historySummary,
        ];
    }

    public function detailByDriverDate(int $driverId, string $date): ?array
    {
        try {
            $normalizedDate = Carbon::createFromFormat('Y-m-d', $date)->toDateString();
        } catch (\Throwable) {
            return null;
        }

        $routes = Route::query()
            ->with(['stops.shipment'])
            ->where('driver_id', $driverId)
            ->whereDate('route_date', $normalizedDate)
            ->where(function ($query) {
                $query->where('total_stops', '>', 0)
                    ->orWhere('completed_stops', '>', 0);
            })
            ->orderBy('created_at')
            ->get();

        if ($routes->isEmpty()) {
            return null;
        }

        return [
            ...$this->buildSummaryEntry($normalizedDate, $routes),
            'routes' => $routes->map(fn (Route $route) => $this->routePayload($route))->values()->all(),
            'shipments' => $this->shipmentHistoryRows($routes)->map(
                fn (array $row) => $this->shipmentPayload($row['shipment'], $row['route'], $row['stop'])
            )->values()->all(),
        ];
    }

    private function buildSummaryEntry(string $date, Collection $routes): array
    {
        $shipmentRows = $this->shipmentHistoryRows($routes);
        $statuses = $routes->pluck('status')->filter();
        $totalStops = (int) $routes->sum('total_stops');
        $completedStops = (int) $routes->sum('completed_stops');
        $issueStops = (int) $routes->flatMap(fn (Route $route) => $route->stops)->where('status', 'issue')->count();
        $pendingStops = max($totalStops - $completedStops - $issueStops, 0);
        $zones = $routes->pluck('zone')->filter()->unique()->values()->all();

        $codCollected = $shipmentRows
            ->filter(fn (array $row) => $this->enumValue($row['shipment']->payment_type) === 'cash_on_delivery')
            ->sum(function (array $row): int {
                $shipment = $row['shipment'];
                return (int) ($shipment->cod_collected_amount ?? $shipment->cod_amount ?? 0);
            });

        return [
            'route_date' => $date,
            'status' => $this->aggregateRouteStatus($statuses),
            'route_count' => $routes->count(),
            'zones' => $zones,
            'total_stops' => $totalStops,
            'completed_stops' => $completedStops,
            'pending_stops' => $pendingStops,
            'issue_stops' => $issueStops,
            'shipment_count' => $shipmentRows->count(),
            'delivered_count' => $shipmentRows->filter(
                fn (array $row) => $this->enumValue($row['shipment']->status) === 'delivered'
            )->count(),
            'cod_collected' => (int) $codCollected,
            'earnings_total' => (int) $shipmentRows->sum(
                fn (array $row): int => (int) ($row['shipment']->driver_fee ?? 0)
            ),
        ];
    }

    private function buildDriverHistorySummaryByDriverId(int $driverId): array
    {
        $baseRoutes = Route::query()
            ->where('driver_id', $driverId)
            ->where(function ($query) {
                $query->where('total_stops', '>', 0)
                    ->orWhere('completed_stops', '>', 0);
            });

        $routeSummary = (clone $baseRoutes)
            ->selectRaw('COUNT(*) as route_count')
            ->selectRaw('COUNT(DISTINCT DATE(route_date)) as worked_days')
            ->selectRaw('COALESCE(SUM(total_stops), 0) as total_stops')
            ->selectRaw('COALESCE(SUM(completed_stops), 0) as completed_stops')
            ->selectRaw('MAX(DATE(route_date)) as last_route_date')
            ->first();

        if (! $routeSummary || (int) ($routeSummary->route_count ?? 0) === 0) {
            return [
                'worked_days' => 0,
                'route_count' => 0,
                'shipment_count' => 0,
                'completed_stops' => 0,
                'pending_stops' => 0,
                'issue_stops' => 0,
                'delivered_count' => 0,
                'cod_collected' => 0,
                'earnings_total' => 0,
                'last_route_date' => null,
            ];
        }

        $issueStops = (int) RouteStop::query()
            ->join('routes', 'route_stops.route_id', '=', 'routes.id')
            ->where('routes.driver_id', $driverId)
            ->where(function ($query) {
                $query->where('routes.total_stops', '>', 0)
                    ->orWhere('routes.completed_stops', '>', 0);
            })
            ->where('route_stops.status', 'issue')
            ->count();

        $shipmentSummary = RouteStop::query()
            ->join('routes', 'route_stops.route_id', '=', 'routes.id')
            ->join('shipments', 'route_stops.shipment_id', '=', 'shipments.id')
            ->where('routes.driver_id', $driverId)
            ->where(function ($query) {
                $query->where('routes.total_stops', '>', 0)
                    ->orWhere('routes.completed_stops', '>', 0);
            })
            ->selectRaw('COUNT(*) as shipment_count')
            ->selectRaw("SUM(CASE WHEN shipments.status = 'delivered' THEN 1 ELSE 0 END) as delivered_count")
            ->selectRaw("SUM(CASE WHEN shipments.payment_type = 'cash_on_delivery' THEN COALESCE(shipments.cod_collected_amount, shipments.cod_amount, 0) ELSE 0 END) as cod_collected")
            ->selectRaw('SUM(COALESCE(shipments.driver_fee, 0)) as earnings_total')
            ->first();

        $totalStops = (int) ($routeSummary->total_stops ?? 0);
        $completedStops = (int) ($routeSummary->completed_stops ?? 0);
        $pendingStops = max($totalStops - $completedStops - $issueStops, 0);

        return [
            'worked_days' => (int) ($routeSummary->worked_days ?? 0),
            'route_count' => (int) ($routeSummary->route_count ?? 0),
            'shipment_count' => (int) ($shipmentSummary->shipment_count ?? 0),
            'completed_stops' => $completedStops,
            'pending_stops' => $pendingStops,
            'issue_stops' => $issueStops,
            'delivered_count' => (int) ($shipmentSummary->delivered_count ?? 0),
            'cod_collected' => (int) ($shipmentSummary->cod_collected ?? 0),
            'earnings_total' => (int) ($shipmentSummary->earnings_total ?? 0),
            'last_route_date' => $routeSummary->last_route_date ? Carbon::parse((string) $routeSummary->last_route_date)->toDateString() : null,
        ];
    }

    private function shipmentHistoryRows(Collection $routes): Collection
    {
        return $routes
            ->flatMap(function (Route $route) {
                return $route->stops
                    ->filter(fn (RouteStop $stop) => $stop->shipment instanceof Shipment)
                    ->map(fn (RouteStop $stop) => [
                        'route' => $route,
                        'stop' => $stop,
                        'shipment' => $stop->shipment,
                    ]);
            })
            ->values();
    }

    private function routePayload(Route $route): array
    {
        $totalStops = (int) $route->total_stops;
        $completedStops = (int) $route->completed_stops;

        return [
            'id' => (int) $route->id,
            'route_date' => $route->route_date?->toDateString(),
            'zone' => $route->zone,
            'status' => (string) $route->status,
            'total_stops' => $totalStops,
            'completed_stops' => $completedStops,
            'progress' => $totalStops > 0 ? (int) round(($completedStops / $totalStops) * 100) : 0,
            'created_at' => $route->created_at?->toISOString(),
            'updated_at' => $route->updated_at?->toISOString(),
            'stops' => $route->stops
                ->filter(fn (RouteStop $stop) => $stop->shipment instanceof Shipment)
                ->map(fn (RouteStop $stop) => $this->shipmentPayload($stop->shipment, $route, $stop))
                ->values()
                ->all(),
        ];
    }

    private function shipmentPayload(Shipment $shipment, Route $route, RouteStop $stop): array
    {
        return [
            'id' => (int) $shipment->id,
            'display_code' => $shipment->display_code,
            'tracking_code' => $shipment->tracking_code,
            'recipient_name' => $shipment->recipient_name,
            'recipient_phone' => $shipment->recipient_phone,
            'recipient_address' => $shipment->recipient_address,
            'recipient_zone' => $shipment->recipient_zone,
            'recipient_city' => $shipment->recipient_city,
            'status' => (string) $this->enumValue($shipment->status),
            'financial_status' => (string) $this->enumValue($shipment->financial_status),
            'payment_type' => (string) $this->enumValue($shipment->payment_type),
            'shipping_cost' => (int) ($shipment->shipping_cost ?? 0),
            'cod_amount' => $shipment->cod_amount !== null ? (int) $shipment->cod_amount : null,
            'cod_collected_amount' => $shipment->cod_collected_amount !== null ? (int) $shipment->cod_collected_amount : null,
            'driver_fee' => $shipment->driver_fee !== null ? (int) $shipment->driver_fee : null,
            'delivered_at' => $shipment->delivered_at?->toISOString(),
            'created_at' => $shipment->created_at?->toISOString(),
            'route_id' => (int) $route->id,
            'route_status' => (string) $route->status,
            'stop_id' => (int) $stop->id,
            'stop_status' => (string) $stop->status,
            'sort_order' => (int) $stop->sort_order,
        ];
    }

    private function aggregateRouteStatus(Collection $statuses): string
    {
        if ($statuses->contains('active')) {
            return 'active';
        }

        if ($statuses->contains('planned')) {
            return 'planned';
        }

        return 'completed';
    }

    private function enumValue(mixed $value): mixed
    {
        return $value instanceof BackedEnum ? $value->value : $value;
    }
}
