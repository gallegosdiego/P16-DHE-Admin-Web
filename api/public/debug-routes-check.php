<?php
// Temporary secure diagnostics script for Danhei Express

require __DIR__.'/../vendor/autoload.php';
$app = require_once __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

header('Content-Type: application/json');

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;

// 1. Verificación de archivo routes/api.php
$routesFile = __DIR__.'/../routes/api.php';
$routesContent = file_exists($routesFile) ? file_get_contents($routesFile) : 'NOT FOUND';
$hasDeployCheck = str_contains($routesContent, 'deploy-check');
$hasDebugJuan = str_contains($routesContent, 'debug-juan');

// 2. Listado de rutas registradas en Laravel
$routes = [];
foreach (Route::getRoutes() as $route) {
    $routes[] = implode('|', $route->methods()) . ' ' . $route->uri();
}

// 3. Consulta de datos del piloto Juan
$driver = DB::table('drivers')->where('name', 'like', '%Juan%')->first();
$usersWithJuanInEmail = DB::table('users')->where('email', 'like', '%juan%')->get();
$usersWithJuanInName = DB::table('users')->where('name', 'like', '%Juan%')->get();

$driverUser = null;
if ($driver && isset($driver->user_id) && $driver->user_id) {
    $driverUser = DB::table('users')->where('id', $driver->user_id)->first();
}

$spatieRoles = DB::table('roles')->get();
$userRoles = [];
if ($driver) {
    $userRoles = DB::table('model_has_roles')
        ->join('roles', 'model_has_roles.role_id', '=', 'roles.id')
        ->where('model_id', $driver->user_id ?? 0)
        ->select('roles.name', 'roles.guard_name', 'model_has_roles.model_id')
        ->get();
}

echo json_encode([
    'routes_file' => [
        'exists' => file_exists($routesFile),
        'size' => file_exists($routesFile) ? filesize($routesFile) : 0,
        'has_deploy_check' => $hasDeployCheck,
        'has_debug_juan' => $hasDebugJuan,
    ],
    'laravel_registered_routes' => $routes,
    'database_diagnostics' => [
        'driver' => $driver,
        'driver_user' => $driverUser,
        'users_matching_email' => $usersWithJuanInEmail,
        'users_matching_name' => $usersWithJuanInName,
        'driver_user_roles' => $userRoles,
    ]
], JSON_PRETTY_PRINT);
