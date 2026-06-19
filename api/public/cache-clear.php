<?php
/**
 * Emergency cache clear script.
 * Call via: https://api.danheiexpress.com/cache-clear.php?key=danhei2026
 * DELETE THIS FILE after confirming routes work.
 */

if (($_GET['key'] ?? '') !== 'danhei2026') {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid key']);
    exit;
}

require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$results = [];

// Clear all caches
foreach (['route:clear', 'config:clear', 'view:clear', 'route:cache', 'config:cache'] as $cmd) {
    try {
        Artisan::call($cmd);
        $results[$cmd] = trim(Artisan::output());
    } catch (Exception $e) {
        $results[$cmd] = 'ERROR: ' . $e->getMessage();
    }
}

// List registered routes containing 'shipment'
$routes = [];
foreach (app('router')->getRoutes() as $route) {
    if (str_contains($route->uri(), 'shipment')) {
        $routes[] = implode('|', $route->methods()) . ' ' . $route->uri();
    }
}

header('Content-Type: application/json');
echo json_encode([
    'cache_results' => $results,
    'shipment_routes' => $routes,
    'timestamp' => now()->toISOString(),
], JSON_PRETTY_PRINT);
