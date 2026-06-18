<?php

/**
 * Deploy Repair Script — Danhei Express
 * 
 * Script seguro para reparar deploy en producción cuando SSH no está disponible.
 * Ejecuta diagnóstico, repara BD, corre migraciones, y reconstruye caches.
 * 
 * Seguridad:
 * - Requiere token secreto en query string
 * - Se auto-elimina después de ejecución exitosa
 * - Logs todo el output
 * 
 * Uso: https://api.danheiexpress.com/deploy-repair.php?token=SECRETO
 */

// ============================================================
// CONFIGURACIÓN DE SEGURIDAD
// ============================================================
$DEPLOY_TOKEN = 'DHE-repair-2026-06-17-X9k2mP';
$SELF_DESTRUCT = true; // Borrar este archivo después de éxito

// Verificar token
if (($_GET['token'] ?? '') !== $DEPLOY_TOKEN) {
    http_response_code(404);
    echo '<!DOCTYPE html><html><body><h1>Not Found</h1></body></html>';
    exit;
}

// ============================================================
// SETUP
// ============================================================
header('Content-Type: text/plain; charset=utf-8');
set_time_limit(300); // 5 minutos max
ini_set('memory_limit', '512M');

$log = [];
function logMsg(string $level, string $msg) {
    global $log;
    $ts = date('H:i:s');
    $line = "[$ts] [$level] $msg";
    $log[] = $line;
    echo $line . "\n";
    flush();
}

logMsg('INFO', '========================================');
logMsg('INFO', 'DEPLOY REPAIR — Danhei Express');
logMsg('INFO', 'Fecha: ' . date('Y-m-d H:i:s'));
logMsg('INFO', '========================================');

// ============================================================
// PASO 0: DIAGNÓSTICO
// ============================================================
logMsg('INFO', '');
logMsg('INFO', '--- PASO 0: DIAGNÓSTICO ---');

// PHP Version
logMsg('INFO', 'PHP Version: ' . PHP_VERSION);
logMsg('INFO', 'PHP SAPI: ' . php_sapi_name());
logMsg('INFO', 'Memory Limit: ' . ini_get('memory_limit'));
logMsg('INFO', 'Max Execution Time: ' . ini_get('max_execution_time'));

// CLI PHP version (the one .cpanel.yml uses)
$cliPhp = '/usr/local/bin/php';
if (file_exists($cliPhp)) {
    $cliVersion = trim(shell_exec("$cliPhp -v 2>&1") ?? 'N/A');
    logMsg('INFO', "CLI PHP ($cliPhp): " . explode("\n", $cliVersion)[0]);
} else {
    logMsg('WARN', "CLI PHP not found at $cliPhp");
}

// Composer
$composerPaths = [
    '/opt/cpanel/composer/bin/composer',
    '/usr/local/bin/composer',
    '/usr/bin/composer',
];
foreach ($composerPaths as $cp) {
    if (file_exists($cp)) {
        logMsg('INFO', "Composer found at: $cp");
        break;
    }
}

// ============================================================
// PASO 1: BOOTSTRAP LARAVEL
// ============================================================
logMsg('INFO', '');
logMsg('INFO', '--- PASO 1: BOOTSTRAP LARAVEL ---');

try {
    require __DIR__ . '/../vendor/autoload.php';
    $app = require_once __DIR__ . '/../bootstrap/app.php';
    $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();
    logMsg('OK', 'Laravel bootstrap exitoso');
    logMsg('INFO', 'APP_ENV: ' . config('app.env'));
    logMsg('INFO', 'DB Connection: ' . config('database.default'));
    logMsg('INFO', 'DB Database: ' . config('database.connections.' . config('database.default') . '.database'));
} catch (Throwable $e) {
    logMsg('FATAL', 'No se pudo inicializar Laravel: ' . $e->getMessage());
    exit(1);
}

// ============================================================
// PASO 2: VERIFICAR BD — Estado actual de tablas
// ============================================================
logMsg('INFO', '');
logMsg('INFO', '--- PASO 2: VERIFICAR BD ---');

use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\Schema\Blueprint;

// Verificar conexión
try {
    DB::connection()->getPdo();
    logMsg('OK', 'Conexión a BD exitosa');
} catch (Throwable $e) {
    logMsg('FATAL', 'No se pudo conectar a BD: ' . $e->getMessage());
    exit(1);
}

// Listar tablas existentes
$tables = DB::select('SHOW TABLES');
$tableNames = array_map(fn($t) => array_values((array)$t)[0], $tables);
logMsg('INFO', 'Tablas existentes (' . count($tableNames) . '): ' . implode(', ', $tableNames));

// Verificar columnas críticas
$checks = [
    ['users', 'deleted_at'],
    ['users', 'driver_id'],
    ['users', 'client_id'],
    ['users', 'phone'],
    ['drivers', 'deleted_at'],
    ['drivers', 'user_id'],
];

$missing = [];
foreach ($checks as [$table, $column]) {
    if (!in_array($table, $tableNames)) {
        logMsg('WARN', "Tabla '$table' NO existe");
        continue;
    }
    if (Schema::hasColumn($table, $column)) {
        logMsg('OK', "$table.$column existe");
    } else {
        logMsg('MISS', "$table.$column FALTA");
        $missing[] = [$table, $column];
    }
}

// Verificar tabla migrations
if (in_array('migrations', $tableNames)) {
    $migrationCount = DB::table('migrations')->count();
    logMsg('INFO', "Tabla migrations: $migrationCount registros");
    
    // Listar migraciones ejecutadas
    $migrations = DB::table('migrations')->orderBy('id')->pluck('migration')->toArray();
    foreach ($migrations as $m) {
        logMsg('INFO', "  ✓ $m");
    }
} else {
    logMsg('WARN', 'Tabla migrations NO existe');
}

// ============================================================
// PASO 3: REPARAR COLUMNAS FALTANTES
// ============================================================
logMsg('INFO', '');
logMsg('INFO', '--- PASO 3: REPARAR COLUMNAS FALTANTES ---');

if (empty($missing)) {
    logMsg('OK', 'No hay columnas faltantes. BD está sincronizada.');
} else {
    logMsg('INFO', count($missing) . ' columna(s) faltante(s). Reparando...');
    
    foreach ($missing as [$table, $column]) {
        try {
            Schema::table($table, function (Blueprint $t) use ($column) {
                switch ($column) {
                    case 'deleted_at':
                        $t->softDeletes();
                        break;
                    case 'driver_id':
                        $t->unsignedBigInteger('driver_id')->nullable();
                        break;
                    case 'client_id':
                        $t->unsignedBigInteger('client_id')->nullable();
                        break;
                    case 'user_id':
                        $t->unsignedBigInteger('user_id')->nullable();
                        break;
                    case 'phone':
                        $t->string('phone', 24)->nullable();
                        break;
                }
            });
            logMsg('FIXED', "$table.$column agregada correctamente");
        } catch (Throwable $e) {
            logMsg('ERROR', "$table.$column - " . $e->getMessage());
        }
    }
}

// ============================================================
// PASO 4: EJECUTAR MIGRACIONES PENDIENTES
// ============================================================
logMsg('INFO', '');
logMsg('INFO', '--- PASO 4: MIGRACIONES ---');

try {
    $output = new Symfony\Component\Console\Output\BufferedOutput();
    
    // Primero: status
    $kernel->call('migrate:status', ['--no-ansi' => true], $output);
    $statusOutput = $output->fetch();
    logMsg('INFO', 'Migration status:');
    foreach (explode("\n", $statusOutput) as $line) {
        if (trim($line)) logMsg('INFO', "  $line");
    }
    
    // Luego: migrate
    $kernel->call('migrate', ['--force' => true, '--no-ansi' => true], $output);
    $migrateOutput = $output->fetch();
    logMsg('INFO', 'Migrate output:');
    foreach (explode("\n", $migrateOutput) as $line) {
        if (trim($line)) logMsg('INFO', "  $line");
    }
    logMsg('OK', 'Migraciones completadas');
} catch (Throwable $e) {
    logMsg('ERROR', 'Migrate falló: ' . $e->getMessage());
}

// ============================================================
// PASO 5: RECONSTRUIR CACHES
// ============================================================
logMsg('INFO', '');
logMsg('INFO', '--- PASO 5: RECONSTRUIR CACHES ---');

$commands = [
    'optimize:clear' => [],
    'config:cache' => [],
    'route:cache' => [],
    'view:cache' => [],
];

foreach ($commands as $cmd => $args) {
    try {
        $output = new Symfony\Component\Console\Output\BufferedOutput();
        $args['--no-ansi'] = true;
        $kernel->call($cmd, $args, $output);
        logMsg('OK', "$cmd: " . trim($output->fetch()));
    } catch (Throwable $e) {
        logMsg('ERROR', "$cmd falló: " . $e->getMessage());
    }
}

// ============================================================
// PASO 6: SEED ROLES
// ============================================================
logMsg('INFO', '');
logMsg('INFO', '--- PASO 6: SEED ROLES ---');

try {
    $output = new Symfony\Component\Console\Output\BufferedOutput();
    $kernel->call('db:seed', [
        '--class' => 'RolesAndPermissionsSeeder',
        '--force' => true,
        '--no-ansi' => true,
    ], $output);
    logMsg('OK', 'Roles seeded: ' . trim($output->fetch()));
} catch (Throwable $e) {
    logMsg('ERROR', 'Seed falló: ' . $e->getMessage());
}

// ============================================================
// PASO 7: VERIFICACIÓN FINAL
// ============================================================
logMsg('INFO', '');
logMsg('INFO', '--- PASO 7: VERIFICACIÓN FINAL ---');

// Re-check columns
foreach ($checks as [$table, $column]) {
    if (!in_array($table, $tableNames)) continue;
    $exists = Schema::hasColumn($table, $column);
    logMsg($exists ? 'OK' : 'FAIL', "$table.$column: " . ($exists ? 'existe' : 'FALTA'));
}

// Check routes
try {
    $output = new Symfony\Component\Console\Output\BufferedOutput();
    $kernel->call('route:list', ['--no-ansi' => true, '--path' => 'api/drivers'], $output);
    $routeList = $output->fetch();
    logMsg('INFO', 'Routes for /api/drivers:');
    foreach (explode("\n", $routeList) as $line) {
        if (trim($line)) logMsg('INFO', "  $line");
    }
} catch (Throwable $e) {
    logMsg('WARN', 'route:list falló: ' . $e->getMessage());
}

// Quick login test
try {
    $testUser = DB::table('users')->where('email', 'admin@danheiexpress.com')->first();
    if ($testUser) {
        logMsg('OK', "User admin encontrado: ID={$testUser->id}, name={$testUser->name}");
        logMsg('INFO', "  driver_id=" . ($testUser->driver_id ?? 'NULL') . ", client_id=" . ($testUser->client_id ?? 'NULL'));
    } else {
        logMsg('WARN', 'User admin@danheiexpress.com no encontrado');
    }
} catch (Throwable $e) {
    logMsg('ERROR', 'User check: ' . $e->getMessage());
}

// ============================================================
// RESULTADO
// ============================================================
logMsg('INFO', '');
logMsg('INFO', '========================================');

$errors = array_filter($log, fn($l) => str_contains($l, '[FAIL]') || str_contains($l, '[FATAL]'));
if (empty($errors)) {
    logMsg('OK', 'DEPLOY REPAIR COMPLETADO EXITOSAMENTE');
    
    // Auto-destruir
    if ($SELF_DESTRUCT) {
        $deleted = @unlink(__FILE__);
        logMsg('INFO', 'Auto-destrucción: ' . ($deleted ? 'archivo eliminado' : 'no se pudo eliminar (borrar manualmente)'));
    }
} else {
    logMsg('WARN', 'DEPLOY REPAIR COMPLETADO CON ERRORES:');
    foreach ($errors as $e) {
        logMsg('WARN', "  $e");
    }
    logMsg('INFO', 'El script NO se auto-eliminó. Corregir errores y re-ejecutar.');
}

logMsg('INFO', '========================================');

// Guardar log
$logFile = __DIR__ . '/storage/logs/deploy-repair-' . date('Y-m-d-His') . '.log';
file_put_contents($logFile, implode("\n", $log));
logMsg('INFO', "Log guardado en: $logFile");
