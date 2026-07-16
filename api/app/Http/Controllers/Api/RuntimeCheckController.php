<?php

namespace App\Http\Controllers\Api;

use App\Domain\Operations\Services\OperationalIntakeSchema;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RuntimeCheckController extends Controller
{
    public function show(OperationalIntakeSchema $operationalIntakeSchema): JsonResponse
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
        $operationalIntakeState = $operationalIntakeSchema->inspect();
        $operationalIntakeTables = $operationalIntakeState['tables'];
        $operationalIntakeColumns = $operationalIntakeState['columns'];
        $pickupRequestOperationalColumns = $operationalIntakeColumns['pickup_requests'];
        $operationalTaskColumns = $operationalIntakeColumns['operational_tasks'];
        $operationalIntakeReady = $operationalIntakeState['ready'];
        $financialRateEarningColumns = $this->columnsState('driver_service_earnings', [
            'rate_rule_id',
            'standard_amount',
            'rate_snapshot_json',
        ]);
        $financialRateRulesReady = Schema::hasTable('financial_rate_rules')
            && ! in_array(false, $financialRateEarningColumns, true);
        $financialMovementColumns = [
            'driver_cod_remittances' => $this->columnsState('driver_cod_remittances', [
                'balance_before', 'balance_after', 'movement_type', 'reversal_of_id', 'approved_by', 'approved_at',
            ]),
            'driver_service_payments' => $this->columnsState('driver_service_payments', [
                'balance_before', 'balance_after', 'movement_type', 'status', 'reversal_of_id', 'approved_by', 'approved_at',
            ]),
            'client_cod_payouts' => $this->columnsState('client_cod_payouts', [
                'balance_before', 'balance_after', 'movement_type', 'status', 'reversal_of_id', 'approved_by', 'approved_at',
            ]),
        ];
        $financialReceiptsReady = collect($financialMovementColumns)
            ->flatten()
            ->doesntContain(false);
        $financialOpeningReady = Schema::hasTable('financial_opening_entries')
            && Schema::hasColumn('driver_cod_obligations', 'opening_entry_id')
            && Schema::hasColumn('driver_service_earnings', 'opening_entry_id')
            && Schema::hasColumn('client_cod_entitlements', 'opening_entry_id');

        $publicStoragePath = public_path('storage');
        $storagePublicPath = storage_path('app/public');
        $publicStorageReady = is_link($publicStoragePath)
            || (is_dir($publicStoragePath) && is_dir($storagePublicPath));

        $googleMapsConfigured = filled(config('services.google.maps_key'));
        $shipmentGeocodingProvider = $googleMapsConfigured ? 'google_maps' : 'nominatim_fallback';
        $shipmentGeocodingRuntimeReady = $shipmentGeodataRuntimeReady = ! in_array(false, $geocodingColumns, true);
        $driverMobileRuntimeReady = ! in_array(false, $driverMobileOptionalColumns, true);
        $routeDayIndexState = $this->routeDayIndexState();
        $sameDayRouteReuseSupported = true;
        $legacyRouteDayUniqueIndexPresent = ! empty($routeDayIndexState['unique_indexes']);
        $routeDayNonUniqueIndexPresent = ! empty($routeDayIndexState['non_unique_indexes']);
        $routeDayIndexOptimized = ! $legacyRouteDayUniqueIndexPresent && $routeDayNonUniqueIndexPresent;
        $multipleRoutesPerDayReady = $sameDayRouteReuseSupported && $routeDayIndexOptimized;
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
        if (! $operationalIntakeReady) {
            $runtimeBlockers[] = 'operational_intake_schema_incomplete';
        }
        if (! $financialRateRulesReady) {
            $runtimeBlockers[] = 'financial_rate_rules_schema_incomplete';
        }
        if (! $financialReceiptsReady) {
            $runtimeBlockers[] = 'financial_receipts_schema_incomplete';
        }
        if (! $financialOpeningReady) {
            $runtimeBlockers[] = 'financial_opening_schema_incomplete';
        }
        $runtimeBlockers = array_values(array_unique($runtimeBlockers));
        $runtimeReady = empty($missing) && $runtimeBlockers === [];

        return response()->json([
            'status' => $runtimeReady ? 'ok' : 'RUNTIME_BLOCKED',
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
                'operational_intake_tables' => $operationalIntakeTables,
                'operational_intake_columns' => $operationalIntakeColumns,
                'pickup_request_operational_columns' => $pickupRequestOperationalColumns,
                'operational_task_columns' => $operationalTaskColumns,
                'operational_intake_ready' => $operationalIntakeReady,
                'financial_rate_earning_columns' => $financialRateEarningColumns,
                'financial_rate_rules_ready' => $financialRateRulesReady,
                'financial_movement_columns' => $financialMovementColumns,
                'financial_receipts_ready' => $financialReceiptsReady,
                'financial_opening_ready' => $financialOpeningReady,
                'multiple_routes_per_day_ready' => $multipleRoutesPerDayReady,
                'route_day_continuity_ready' => $multipleRoutesPerDayReady,
                'same_day_route_reuse_supported' => $sameDayRouteReuseSupported,
                'route_day_index_optimized' => $routeDayIndexOptimized,
                'route_day_index_state' => $routeDayIndexState,
            ],
            'services' => [
                'google_maps_geocoding_configured' => $googleMapsConfigured,
                'google_maps_geocoding_optional' => true,
                'shipment_geocoding_provider' => $shipmentGeocodingProvider,
                'shipment_geocoding_runtime_ready' => $shipmentGeocodingRuntimeReady,
                'shipment_geocoding_fallback_enabled' => true,
            ],
            'runtime_blockers' => $runtimeBlockers,
            'timestamp' => now()->toISOString(),
        ], $runtimeReady ? 200 : 503);
    }

    /**
     * @param  list<string>  $columns
     * @return array<string, bool>
     */
    private function columnsState(string $table, array $columns): array
    {
        if (! Schema::hasTable($table)) {
            return array_fill_keys($columns, false);
        }

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
     * @param  array<string, bool>  ...$columnGroups
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

        $routeDayIndexState = $this->routeDayIndexState();
        if (! empty($routeDayIndexState['unique_indexes'])) {
            $runtimeBlockers[] = 'legacy_route_day_unique_index_present';
        }
        if (empty($routeDayIndexState['non_unique_indexes'])) {
            $runtimeBlockers[] = 'missing_route_day_non_unique_index';
        }

        return array_values(array_unique($runtimeBlockers));
    }
}
