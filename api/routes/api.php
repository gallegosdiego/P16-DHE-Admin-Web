<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\DriverController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\FinancialController;
use App\Http\Controllers\Api\PayrollController;
use App\Http\Controllers\Api\ShipmentController;
use App\Http\Controllers\Api\TrackingController;
use Illuminate\Support\Facades\Route;

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
Route::post('/login', [AuthController::class, 'login']);
Route::get('/track', [TrackingController::class, 'track']);

// Rutas protegidas
Route::middleware('auth:sanctum')->group(function () {

    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Dashboard
    Route::get('/dashboard', [ShipmentController::class, 'dashboard']);

    // Envíos
    Route::apiResource('shipments', ShipmentController::class)->except(['destroy']);
    Route::post('/shipments/{shipment}/status', [ShipmentController::class, 'changeStatus']);
    Route::post('/shipments/{shipment}/assign', [ShipmentController::class, 'assign']);

    // Clientes
    Route::apiResource('clients', ClientController::class)->except(['destroy']);
    Route::get('/clients-receivable', [ClientController::class, 'accountsReceivable']);

    // Conductores
    Route::apiResource('drivers', DriverController::class)->except(['destroy']);
    Route::post('/drivers/{driver}/toggle-status', [DriverController::class, 'toggleStatus']);

    // Financiero
    Route::prefix('financial')->group(function () {
        Route::get('/overview', [FinancialController::class, 'overview']);
        Route::get('/driver-board', [FinancialController::class, 'driverBoard']);
        Route::post('/shipments/{shipment}/collect', [FinancialController::class, 'markCollected']);
        Route::post('/shipments/{shipment}/settle', [FinancialController::class, 'settleShipment']);
        Route::post('/shipments/{shipment}/driver-paid', [FinancialController::class, 'markDriverPaid']);
        Route::post('/settle-batch', [FinancialController::class, 'settleBatch']);
    });

    // Gastos fijos
    Route::get('/expenses', [ExpenseController::class, 'index']);
    Route::post('/expenses', [ExpenseController::class, 'store']);
    Route::put('/expenses/{id}', [ExpenseController::class, 'update']);
    Route::post('/expenses/{id}/pay', [ExpenseController::class, 'markPaid']);

    // Nómina / Empleados
    Route::get('/employees', [PayrollController::class, 'index']);
    Route::post('/employees', [PayrollController::class, 'store']);
    Route::put('/employees/{id}', [PayrollController::class, 'update']);
    Route::post('/employees/{id}/pay', [PayrollController::class, 'markPaid']);
});
