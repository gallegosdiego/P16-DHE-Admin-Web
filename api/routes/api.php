<?php
// API Routes — Danhei Express
// Deploy trigger: 2026-06-19T13:19

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\ClientPortalController;
use App\Http\Controllers\Api\CodSettlementController;
use App\Http\Controllers\Api\DriverController;
use App\Http\Controllers\Api\DriverPayoutController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\ExportController;
use App\Http\Controllers\Api\FinancialController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PayrollController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RouteController;
use App\Http\Controllers\Api\ShipmentController;
use App\Http\Controllers\Api\TrackingController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\ZoneController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
|--------------------------------------------------------------------------
| Danhei Express API Routes
|--------------------------------------------------------------------------
|
| Prefijo: /api
| Auth: Laravel Sanctum (Bearer Token)
|
*/

// ── Públicos (sin auth) ──────────────────────
Route::get('/health', [AuthController::class, 'health']);
Route::get('/deploy-check', function () {
    $critical = [
        'GET api/shipments',
        'DELETE api/shipments/{shipment}',
        'POST api/shipments/{shipment}/delete',
        'POST api/login',
    ];
    $codCollectionColumns = collect(['cod_collected_amount', 'cod_payment_method', 'cod_collected_at'])
        ->mapWithKeys(fn ($column) => [$column => Schema::hasColumn('shipments', $column)])
        ->all();
    $driverMobileOptionalColumns = collect(['intake_photo', 'recipient_lat', 'recipient_lng'])
        ->mapWithKeys(fn ($column) => [$column => Schema::hasColumn('shipments', $column)])
        ->all();
    $driverLiveLocationColumns = collect(['last_lat', 'last_lng', 'last_heading', 'last_speed', 'last_location_updated_at'])
        ->mapWithKeys(fn ($column) => [$column => Schema::hasColumn('drivers', $column)])
        ->all();
    $routeMetricColumns = collect([
        'optimized_distance_meters',
        'optimized_duration_seconds',
        'remaining_distance_meters',
        'remaining_duration_seconds',
        'optimization_source',
        'optimized_at',
        'origin_lat',
        'origin_lng',
    ])->mapWithKeys(fn ($column) => [$column => Schema::hasColumn('routes', $column)])
        ->all();
    $routeGeometryColumns = collect(['overview_polyline', 'route_legs'])
        ->mapWithKeys(fn ($column) => [$column => Schema::hasColumn('routes', $column)])
        ->all();
    $multipleRoutesPerDayReady = (function (): bool {
        if (! Schema::hasTable('routes')) {
            return false;
        }

        $driver = DB::connection()->getDriverName();
        $compositeIndexes = [];

        if ($driver === 'mysql') {
            $rows = DB::select('SHOW INDEX FROM routes');
            foreach ($rows as $row) {
                $key = (string) $row->Key_name;
                $compositeIndexes[$key]['non_unique'] = (int) $row->Non_unique;
                $compositeIndexes[$key]['columns'][(int) $row->Seq_in_index] = (string) $row->Column_name;
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
            return false;
        }

        $hasUnique = false;
        $hasNonUnique = false;

        foreach ($compositeIndexes as $index) {
            $columns = $index['columns'] ?? [];
            ksort($columns);
            $columns = array_values($columns);

            if ($columns !== ['driver_id', 'route_date']) {
                continue;
            }

            if ((int) ($index['non_unique'] ?? 1) === 0) {
                $hasUnique = true;
                continue;
            }

            $hasNonUnique = true;
        }

        return $hasNonUnique && ! $hasUnique;
    })();
    $registered = collect(app('router')->getRoutes())->map(fn ($r) => implode('|', $r->methods()) . ' ' . $r->uri())->toArray();
    $missing = [];
    foreach ($critical as $route) {
        $found = false;
        foreach ($registered as $r) {
            if (str_contains($r, explode(' ', $route)[1]) && str_contains($r, explode(' ', $route)[0])) {
                $found = true;
                break;
            }
        }
        if (!$found) $missing[] = $route;
    }
    return response()->json([
        'status' => empty($missing) ? 'ok' : 'MISSING_ROUTES',
        'missing' => $missing,
        'total_routes' => count($registered),
        'database' => [
            'cod_collection_columns' => $codCollectionColumns,
            'cod_collection_ready' => ! in_array(false, $codCollectionColumns, true),
            'driver_mobile_optional_columns' => $driverMobileOptionalColumns,
            'driver_live_location_columns' => $driverLiveLocationColumns,
            'driver_live_location_ready' => ! in_array(false, $driverLiveLocationColumns, true),
            'route_metric_columns' => $routeMetricColumns,
            'route_metric_ready' => ! in_array(false, $routeMetricColumns, true),
            'route_geometry_columns' => $routeGeometryColumns,
            'route_geometry_ready' => ! in_array(false, $routeGeometryColumns, true),
            'multiple_routes_per_day_ready' => $multipleRoutesPerDayReady,
        ],
        'timestamp' => now()->toISOString(),
    ], empty($missing) ? 200 : 503);
});
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
Route::get('/track', [TrackingController::class, 'track'])->middleware('throttle:30,1');

// Rutas protegidas
Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {

    // Auth — cualquier usuario autenticado
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::put('/me', [AuthController::class, 'updateProfile']);
    Route::put('/me/password', [AuthController::class, 'changePassword']);

    // Dashboard — requiere permiso dashboard.view
    Route::middleware('permission:dashboard.view')->group(function () {
        Route::get('/dashboard', [ShipmentController::class, 'dashboard']);
        Route::get('/dashboard/hourly', [ShipmentController::class, 'hourlyStats']);
    });
    Route::get('/client/my-dashboard', [ClientController::class, 'myDashboard'])->middleware('scope');
    Route::get('/driver/operational-state', [RouteController::class, 'operationalState'])->middleware('scope');
    Route::post('/driver/location', [RouteController::class, 'updateDriverLocation'])->middleware('scope');
    Route::get('/driver/my-route', [RouteController::class, 'myRoute'])->middleware('scope');
    Route::get('/driver/assigned-shipments', [RouteController::class, 'assignedShipments'])->middleware('scope');
    Route::post('/driver/smart-route', [RouteController::class, 'createSmartRoute'])->middleware('scope');

    // Envíos — escritura masiva (para selección múltiple)
    Route::post('/shipments/batch-status', [ShipmentController::class, 'batchStatus'])->middleware('permission:shipments.change_status');
    Route::post('/shipments/batch-assign', [ShipmentController::class, 'batchAssign'])->middleware('permission:shipments.assign');
    Route::post('/shipments/batch-delete', [ShipmentController::class, 'batchDestroy'])->middleware('permission:shipments.delete');

    // Envíos — lectura
    Route::get('/shipments', [ShipmentController::class, 'index'])->middleware('permission:shipments.view');
    Route::get('/shipments/{shipment}', [ShipmentController::class, 'show'])->middleware('permission:shipments.view');

    // Envíos — escritura
    Route::post('/shipments', [ShipmentController::class, 'store'])->middleware('permission:shipments.create');
    Route::put('/shipments/{shipment}', [ShipmentController::class, 'update'])->middleware('permission:shipments.edit');
    Route::post('/shipments/{shipment}/status', [ShipmentController::class, 'changeStatus'])->middleware('permission:shipments.change_status');
    Route::post('/shipments/{shipment}/assign', [ShipmentController::class, 'assign'])->middleware('permission:shipments.assign');
    Route::delete('/shipments/{shipment}', [ShipmentController::class, 'destroy'])->middleware('permission:shipments.delete');
    Route::post('/shipments/{shipment}/delete', [ShipmentController::class, 'destroy'])->middleware('permission:shipments.delete');

    // Clientes
    Route::get('/clients', [ClientController::class, 'index'])->middleware('permission:clients.view');
    Route::get('/clients/{client}', [ClientController::class, 'show'])->middleware('permission:clients.view');
    Route::post('/clients', [ClientController::class, 'store'])->middleware('permission:clients.create');
    Route::put('/clients/{client}', [ClientController::class, 'update'])->middleware('permission:clients.edit');
    Route::get('/clients-receivable', [ClientController::class, 'accountsReceivable'])->middleware('permission:financial.view');
    Route::post('/clients/{client}/settle-receivables', [ClientController::class, 'settleReceivables'])->middleware('permission:financial.settle');

    // Direcciones de clientes
    Route::post('/clients/{client}/addresses', [ClientController::class, 'storeAddress'])->middleware('permission:clients.edit');
    Route::put('/client-addresses/{address}', [ClientController::class, 'updateAddress'])->middleware('permission:clients.edit');
    Route::delete('/client-addresses/{address}', [ClientController::class, 'deleteAddress'])->middleware('permission:clients.edit');

    // Audit log (solo superadmin/admin)
    Route::get('/audit-logs', function (Request $request) {
        $perPage = min(max((int) $request->query('per_page', 50), 1), 100);

        $query = \App\Domain\Shared\Models\AuditLog::query()
            ->with('user:id,name')
            ->when($request->filled('search'), function ($query) use ($request) {
                $search = trim((string) $request->query('search'));
                $query->where(function ($query) use ($search) {
                    $query
                        ->where('action', 'like', "%{$search}%")
                        ->orWhere('description', 'like', "%{$search}%")
                        ->orWhereHas('user', fn ($query) => $query->where('name', 'like', "%{$search}%"));
                });
            })
            ->when($request->filled('action') && $request->query('action') !== 'all', function ($query) use ($request) {
                $query->where('action', $request->query('action'));
            })
            ->when($request->filled('user_id') && $request->query('user_id') !== 'all', function ($query) use ($request) {
                $query->where('user_id', $request->query('user_id'));
            })
            ->when($request->filled('date_from'), function ($query) use ($request) {
                $query->whereDate('occurred_at', '>=', $request->query('date_from'));
            })
            ->when($request->filled('date_to'), function ($query) use ($request) {
                $query->whereDate('occurred_at', '<=', $request->query('date_to'));
            })
            ->orderByDesc('occurred_at')
            ->orderByDesc('id');

        return $query->paginate($perPage);
    })->middleware('permission:financial.view');

    if (app()->environment('local', 'testing')) {
    Route::get('/drivers/debug-juan', function (Request $request) {
        $user = $request->user();
        if (!$user || !array_intersect($user->roles()->pluck('name')->all(), ['superadmin', 'admin', 'administrador', 'operador'])) {
            return response()->json(['error' => 'Acceso denegado.'], 403);
        }

        // Buscar piloto Juan de manera exacta
        $driver = \App\Domain\Driver\Models\Driver::where('name', 'like', '%Juan%')
            ->withTrashed()
            ->with(['user' => fn($q) => $q->withTrashed()])
            ->first();

        if (!$driver) {
            return response()->json(['message' => 'No se encontró ningún piloto con nombre Juan.'], 404);
        }

        // Consultar usuarios que apunten a este driver_id
        $linkedUsers = \App\Models\User::where('driver_id', $driver->id)->withTrashed()->get();

        // Envíos asignados activos
        $shipments = \App\Domain\Shipment\Models\Shipment::where('driver_id', $driver->id)
            ->whereNotIn('status', ['delivered', 'returned', 'cancelled'])
            ->select('id', 'display_code', 'status')
            ->withCount('routeStops')
            ->get();

        return response()->json([
            'driver_record' => [
                'id' => $driver->id,
                'name' => $driver->name,
                'status' => $driver->status,
                'user_id' => $driver->user_id,
                'deleted' => $driver->trashed(),
            ],
            'user_linked_to_driver' => $driver->user ? [
                'id' => $driver->user->id,
                'email' => $driver->user->email,
                'driver_id' => $driver->user->driver_id,
                'roles' => $driver->user->roles()->pluck('name')->all(),
                'deleted' => $driver->user->trashed(),
            ] : null,
            'users_matching_driver_id' => $linkedUsers->map(fn($u) => [
                'id' => $u->id,
                'email' => $u->email,
                'driver_id' => $u->driver_id,
                'roles' => $u->roles()->pluck('name')->all(),
                'deleted' => $u->trashed(),
            ]),
            'assigned_shipments' => [
                'total' => $shipments->count(),
                'items' => $shipments,
            ]
        ]);
    });
    }

    // Conductores
    Route::get('/drivers', [DriverController::class, 'index'])->middleware('permission:drivers.view');
    Route::get('/drivers/{driver}', [DriverController::class, 'show'])->middleware('permission:drivers.view');
    Route::post('/drivers', [DriverController::class, 'store'])->middleware('permission:drivers.create');
    Route::put('/drivers/{driver}', [DriverController::class, 'update'])->middleware('permission:drivers.edit');
    Route::post('/drivers/{driver}', [DriverController::class, 'update'])->middleware('permission:drivers.edit');
    Route::post('/drivers/{driver}/toggle-status', [DriverController::class, 'toggleStatus'])->middleware('permission:drivers.toggle_status');
    Route::delete('/drivers/{driver}', [DriverController::class, 'destroy'])->middleware('permission:drivers.delete');
    Route::post('/drivers/{driver}/delete', [DriverController::class, 'destroy'])->middleware('permission:drivers.delete');
    Route::get('/drivers-trashed', [DriverController::class, 'trashed'])->middleware('permission:drivers.view');
    Route::post('/drivers/{id}/restore', [DriverController::class, 'restore'])->middleware('permission:drivers.create');

    // Financiero — solo roles con permiso financiero
    Route::prefix('financial')->middleware('permission:financial.view')->group(function () {
        Route::get('/overview', [FinancialController::class, 'overview']);
        Route::get('/daily-summary', [FinancialController::class, 'dailySummary']);
        Route::get('/profit-loss', [FinancialController::class, 'profitLoss']);
        Route::get('/driver-board', [FinancialController::class, 'driverBoard']);
        Route::post('/shipments/{shipment}/collect', [FinancialController::class, 'markCollected'])->middleware('permission:financial.collect');
        Route::post('/shipments/{shipment}/settle', [FinancialController::class, 'settleShipment'])->middleware('permission:financial.settle');
        Route::post('/shipments/{shipment}/driver-paid', [FinancialController::class, 'markDriverPaid'])->middleware('permission:financial.settle');
        Route::post('/settle-batch', [FinancialController::class, 'settleBatch'])->middleware('permission:financial.settle');
        Route::post('/collect-batch', [FinancialController::class, 'collectBatch'])->middleware('permission:financial.collect');
        Route::post('/driver-paid-batch', [FinancialController::class, 'driverPaidBatch'])->middleware('permission:financial.settle');

        // KPIs, Reportes avanzados y Rentabilidad
        Route::get('/kpis', [FinancialController::class, 'kpis']);
        Route::get('/aging-report', [FinancialController::class, 'agingReport']);
        Route::get('/cash-flow', [FinancialController::class, 'cashFlow']);
        Route::get('/profitability/by-zone', [FinancialController::class, 'profitabilityByZone']);
        Route::get('/profitability/by-driver', [FinancialController::class, 'profitabilityByDriver']);
        Route::get('/profitability/by-client', [FinancialController::class, 'profitabilityByClient']);
        Route::get('/driver-settlement/{driver}', [FinancialController::class, 'driverSettlement']);
        Route::get('/alerts', [FinancialController::class, 'alerts']);
    });

    // Conciliación COD — solo con permiso financiero
    Route::middleware('permission:financial.settle')->group(function () {
        Route::get('/cod-settlements', [CodSettlementController::class, 'index']);
        Route::get('/cod-settlements/daily-summary', [CodSettlementController::class, 'dailySummary']);
        Route::post('/cod-settlements', [CodSettlementController::class, 'store']);
        Route::post('/cod-settlements/{settlement}/close', [CodSettlementController::class, 'close']);
    });

    // Pagos a conductores — solo con permiso financiero
    Route::middleware('permission:financial.settle')->group(function () {
        Route::get('/driver-payouts', [DriverPayoutController::class, 'index']);
        Route::get('/driver-payouts/pending', [DriverPayoutController::class, 'pending']);
        Route::post('/driver-payouts/generate', [DriverPayoutController::class, 'generate']);
        Route::post('/driver-payouts/{payout}/pay', [DriverPayoutController::class, 'markPaid']);
    });

    // Gastos fijos — solo con permiso de gastos
    Route::middleware('permission:financial.expenses')->group(function () {
        Route::get('/expenses', [ExpenseController::class, 'index']);
        Route::post('/expenses', [ExpenseController::class, 'store']);
        Route::put('/expenses/{expense}', [ExpenseController::class, 'update']);
        Route::post('/expenses/{expense}/pay', [ExpenseController::class, 'markPaid']);
        Route::get('/expenses/{expense}/history', [ExpenseController::class, 'history']);
    });

    // Nómina — solo con permiso de nómina
    Route::middleware('permission:financial.payroll')->group(function () {
        Route::get('/employees', [PayrollController::class, 'index']);
        Route::post('/employees', [PayrollController::class, 'store']);
        Route::put('/employees/{employee}', [PayrollController::class, 'update']);
        Route::post('/employees/{employee}/pay', [PayrollController::class, 'markPaid']);
        Route::get('/employees/{employee}/history', [PayrollController::class, 'history']);
    });

    // Usuarios — solo admin/superadmin
    Route::middleware('permission:users.view')->group(function () {
        Route::get('/users', [UserController::class, 'index']);
        Route::get('/users/{user}', [UserController::class, 'show']);
        Route::get('/roles', [UserController::class, 'roles']);
    });
    Route::post('/users', [UserController::class, 'store'])->middleware('permission:users.create');
    Route::put('/users/{user}', [UserController::class, 'update'])->middleware('permission:users.edit');
    Route::delete('/users/{user}', [UserController::class, 'destroy'])->middleware('permission:users.delete');
    Route::get('/users-trashed', [UserController::class, 'trashed'])->middleware('permission:users.view');
    Route::post('/users/{id}/restore', [UserController::class, 'restore'])->middleware('permission:users.create');

    // Reportes
    Route::middleware('permission:reports.view')->group(function () {
        Route::get('/reports/stats', [ReportController::class, 'stats']);
        Route::get('/reports/export/shipments', [ReportController::class, 'exportShipments']);
        Route::get('/reports/export/financial', [ReportController::class, 'exportFinancial']);
        Route::get('/reports/export/receivables', [ReportController::class, 'exportReceivables']);
        Route::get('/reports/export/payroll', [ReportController::class, 'exportPayroll']);
        Route::get('/reports/export/expenses', [ReportController::class, 'exportExpenses']);
    });

    // Zonas de cobertura
    Route::get('/zones', [ZoneController::class, 'index']);
    Route::get('/zones/{zone}', [ZoneController::class, 'show']);
    Route::post('/zones', [ZoneController::class, 'store'])->middleware('permission:shipments.create');
    Route::put('/zones/{zone}', [ZoneController::class, 'update'])->middleware('permission:shipments.edit');
    Route::post('/zones/{zone}/calculate', [ZoneController::class, 'calculatePrice']);
    Route::post('/zones/{zone}/pricing-rules', [ZoneController::class, 'storePricingRule'])->middleware('permission:shipments.edit');
    Route::put('/pricing-rules/{pricingRule}', [ZoneController::class, 'updatePricingRule'])->middleware('permission:shipments.edit');

    // Notificaciones
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);

    // Rutas diarias
    Route::get('/routes', [RouteController::class, 'index'])->middleware(['scope', 'permission:shipments.view']);
    Route::get('/routes/routable-shipments', [RouteController::class, 'routableShipments'])->middleware(['scope', 'permission:shipments.view']);
    Route::get('/routes/{route}', [RouteController::class, 'show'])->middleware(['scope', 'permission:shipments.view']);
    Route::post('/routes', [RouteController::class, 'store'])->middleware('permission:shipments.assign');
    Route::post('/routes/{route}/start', [RouteController::class, 'start'])->middleware(['scope', 'permission:shipments.change_status']);
    Route::post('/routes/{route}/finalize', [RouteController::class, 'finalize'])->middleware('scope');
    Route::post('/routes/{route}/stops/{stop}/complete', [RouteController::class, 'completeStop'])->middleware(['scope', 'permission:shipments.change_status']);
    Route::put('/routes/{route}/reorder', [RouteController::class, 'reorder'])->middleware('permission:shipments.assign');
    Route::post('/routes/{route}/add-stop', [RouteController::class, 'addStop'])->middleware('permission:shipments.assign');
    Route::post('/routes/{route}/optimize', [RouteController::class, 'optimize'])->middleware(['scope', 'permission:routes.manage']);
    Route::delete('/routes/{route}/stops/{stop}', [RouteController::class, 'removeStop'])->middleware(['scope', 'permission:routes.manage']);
    Route::post('/routes/{route}/stops/{stop}/delete', [RouteController::class, 'removeStop'])->middleware(['scope', 'permission:routes.manage']);

    // Portal cliente (scope por client_id del usuario autenticado)
    Route::prefix('client-portal')->middleware('scope')->group(function () {
        Route::get('/dashboard', [ClientPortalController::class, 'dashboard']);
        Route::get('/shipments', [ClientPortalController::class, 'shipments']);
        Route::get('/shipments/{shipment}', [ClientPortalController::class, 'shipmentDetail']);
        Route::get('/financial', [ClientPortalController::class, 'financial']);
        Route::get('/profile', [ClientPortalController::class, 'profile']);
    });

    // Exportaciones CSV — solo admin/superadmin
    Route::prefix('exports')->middleware('permission:reports.export')->group(function () {
        Route::get('/shipments', [ExportController::class, 'shipments']);
    });
});
