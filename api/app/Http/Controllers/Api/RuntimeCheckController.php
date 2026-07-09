<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;

class RuntimeCheckController extends Controller
{
    public function show(): JsonResponse
    {
        $critical = [
            'GET api/shipments',
            'DELETE api/shipments/{shipment}',
            'POST api/shipments/{shipment}/delete',
            'POST api/login',
        ];

        $codCollectionColumns = $this->columnsState('shipments', [
            'cod_collected_amount',
            'cod_payment_method',
            'cod_collected_at',
        ]);
        $driverMobileOptionalColumns = $this->columnsState('shipments', [
            'intake_photo',
            'recipient_lat',
            'recipient_lng',
        ]);
        $geocodingColumns = $this->columnsState('shipments', [
            'recipient_lat',
            'recipient_lng',
            'geocoded_at',
        ]);
        $driverLiveLocationColumns = $this->columnsState('drivers', [
            'last_lat',
            'last_lng',
            'last_heading',
            'last_speed',
            'last_location_updated_at',
        ]);
        $driverDocumentColumns = $this->columnsState('drivers', [
            'driver_license_photo',
            'vehicle_registration_photo',
            'soat_photo',
            'technical_inspection_photo',
            'national_id_front_photo',
            'national_id_back_photo',
        ]);
        $driverDocumentExpiryColumns = $this->columnsState('drivers', [
            'driver_license_expires_at',
            'soat_expires_at',
            'technical_inspection_expires_at',
        ]);
        $routeMetricColumns = $this->columnsState('routes', [
            'optimized_distance_meters',
            'optimized_duration_seconds',
            'remaining_distance_meters',
            'remaining_duration_seconds',
            'optimization_source',
            'optimized_at',
            'origin_lat',
            'origin_lng',
        ]);
        $routeGeometryColumns = $this->columnsState('routes', [
            'overview_polyline',
            'route_legs',
        ]);

        $publicStoragePath = public_path('storage');
        $storagePublicPath = storage_path('app/public');
        $publicStorageReady = is_link($publicStoragePath)
            || (is_dir($publicStoragePath) && is_dir($storagePublicPath));

        $googleMapsConfigured = filled(config('services.google.maps_key'));
        $shipmentGeocodingProvider = $googleMapsConfigured ? 'google_maps' : 'nominatim_fallback';
        $driverMobileRuntimeReady = ! in_array(false, $driverMobileOptionalColumns, true);
        $shipmentGeodataRuntimeReady = ! in_array(false, $geocodingColumns, true);
        $routeDayIndexState = $this->routeDayIndexState();
        $sameDayRouteReuseSupported = true;
        $multipleRoutesPerDayReady = empty($routeDayIndexState['unique_indexes']) || $sameDayRouteReuseSupported;
        $routeDayIndexOptimized = ! empty($routeDayIndexState['non_unique_indexes']);
        $registered = collect(app('router')->getRoutes())
            ->map(fn ($route) => implode('|', $route->methods()).' '.$route->uri())
            ->toArray();

        $missing = [];
        foreach ($critical as $route) {
            $found = false;
            foreach ($registered as $registeredRoute) {
                if (
                    str_contains($registeredRoute, explode(' ', $route)[1])
                    && str_contains($registeredRoute, explode(' ', $route)[0])
                ) {
                    $found = true;
                    break;
                }
            }

            if (! $found) {
                $missing[] = $route;
            }
        }

        $runtimeBlockers = $this->runtimeBlockers(
            $driverMobileOptionalColumns,
            $geocodingColumns,
            $driverDocumentColumns,
            $driverDocumentExpiryColumns,
        );

        return response()->json([
            'status' => empty($missing) ? 'ok' : 'MISSING_ROUTES',
            'missing' => $missing,
            'total_routes' => count($registered),
            'database' => [
                'cod_collection_columns' => $codCollectionColumns,
                'cod_collection_ready' => ! in_array(false, $codCollectionColumns, true),
                'driver_mobile_optional_columns' => $driverMobileOptionalColumns,
                'driver_mobile_runtime_ready' => $driverMobileRuntimeReady,
                'geocoding_columns' => $geocodingColumns,
                'geocoding_ready' => ! in_array(false, $geocodingColumns, true),
                'shipment_geodata_runtime_ready' => $shipmentGeodataRuntimeReady,
                'driver_live_location_columns' => $driverLiveLocationColumns,
                'driver_live_location_ready' => ! in_array(false, $driverLiveLocationColumns, true),
                'driver_document_columns' => $driverDocumentColumns,
                'driver_document_ready' => ! in_array(false, $driverDocumentColumns, true),
                'driver_document_expiry_columns' => $driverDocumentExpiryColumns,
                'driver_document_expiry_ready' => ! in_array(false, $driverDocumentExpiryColumns, true),
                'public_storage_ready' => $publicStorageReady,
                'route_metric_columns' => $routeMetricColumns,
                'route_metric_ready' => ! in_array(false, $routeMetricColumns, true),
                'route_geometry_columns' => $routeGeometryColumns,
                'route_geometry_ready' => ! in_array(false, $routeGeometryColumns, true),
                'multiple_routes_per_day_ready' => $multipleRoutesPerDayReady,
                'route_day_continuity_ready' => $multipleRoutesPerDayReady,
                'same_day_route_reuse_supported' => $sameDayRouteReuseSupported,
                'route_day_index_optimized' => $routeDayIndexOptimized,
                'route_day_index_state' => $routeDayIndexState,
            ],
            'services' => [
                'google_maps_geocoding_configured' => $googleMapsConfigured,
                'shipment_geocoding_provider' => $shipmentGeocodingProvider,
                'shipment_geocoding_fallback_enabled' => true,
            ],
            'runtime_blockers' => $runtimeBlockers,
            'timestamp' => now()->toISOString(),
        ], empty($missing) ? 200 : 503);
    }

    /**
     * @param list<string> $columns
     * @return array<string, bool>
     */
    private function columnsState(string $table, array $columns): array
    {
        return collect($columns)
            ->mapWithKeys(fn ($column) => [$column => Schema::hasColumn($table, $column)])
            ->all();
    }

    /**
     * @return array{unique_indexes: list<string>, non_unique_indexes: list<string>}
     */
    private function routeDayIndexState(): array
    {
        if (! Schema::hasTable('routes')) {
            return [
                'unique_indexes' => [],
                'non_unique_indexes' => [],
            ];
        }

        $driver = DB::connection()->getDriverName();
        $compositeIndexes = [];

        if ($driver === 'mysql') {
            $rows = DB::select("
                SELECT
                    INDEX_NAME as index_name,
                    NON_UNIQUE as non_unique,
                    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') as columns_csv
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                  AND table_name = 'routes'
                GROUP BY INDEX_NAME, NON_UNIQUE
            ");

            foreach ($rows as $row) {
                $key = (string) $row->index_name;
                $compositeIndexes[$key] = [
                    'non_unique' => (int) $row->non_unique,
                    'columns' => array_values(array_filter(explode(',', (string) ($row->columns_csv ?? '')))),
                ];
            }
        } elseif ($driver === 'sqlite') {
            $rows = DB::select("PRAGMA index_list('routes')");

            foreach ($rows as $row) {
                $key = (string) $row->name;
                $infoRows = DB::select("PRAGMA index_info('".str_replace("'", "''", $key)."')");
                $columns = [];

                foreach ($infoRows as $infoRow) {
                    $columns[(int) $infoRow->seqno] = (string) $infoRow->name;
                }

                ksort($columns);

                $compositeIndexes[$key] = [
                    'non_unique' => ((int) $row->unique) === 1 ? 0 : 1,
                    'columns' => array_values($columns),
                ];
            }
        } else {
            return [
                'unique_indexes' => [],
                'non_unique_indexes' => [],
            ];
        }

        $uniqueIndexes = [];
        $nonUniqueIndexes = [];

        foreach ($compositeIndexes as $indexName => $index) {
            $columns = $index['columns'] ?? [];
            ksort($columns);
            $columns = array_values($columns);

            if ($columns !== ['driver_id', 'route_date']) {
                continue;
            }

            if ((int) ($index['non_unique'] ?? 1) === 0) {
                $uniqueIndexes[] = (string) $indexName;
                continue;
            }

            $nonUniqueIndexes[] = (string) $indexName;
        }

        return [
            'unique_indexes' => array_values(array_unique($uniqueIndexes)),
            'non_unique_indexes' => array_values(array_unique($nonUniqueIndexes)),
        ];
    }

    /**
     * @param array<string, bool> ...$columnGroups
     * @return list<string>
     */
    private function runtimeBlockers(array ...$columnGroups): array
    {
        $runtimeBlockers = [];

        foreach ($columnGroups as $group) {
            foreach ($group as $column => $ready) {
                if (! $ready) {
                    $prefix = str_contains($column, 'driver_') || str_contains($column, 'national_') || str_contains($column, 'soat') || str_contains($column, 'technical_')
                        ? 'drivers'
                        : 'shipments';
                    $runtimeBlockers[] = "missing_{$prefix}_{$column}";
                }
            }
        }

        return array_values(array_unique($runtimeBlockers));
    }
}
