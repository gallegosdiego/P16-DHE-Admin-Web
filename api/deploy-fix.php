<?php

/**
 * Script de reparación de esquema para deploy en producción.
 * Se ejecuta ANTES de `migrate --force` en .cpanel.yml
 * 
 * Agrega columnas faltantes que las migraciones podrían no haber creado
 * en deploys anteriores fallidos. Completamente idempotente.
 * 
 * Uso: php deploy-fix.php (desde CLI, ejecutado por .cpanel.yml)
 */

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;

$fixes = [
    ['table' => 'users',   'column' => 'deleted_at', 'type' => 'softDeletes'],
    ['table' => 'users',   'column' => 'client_id',  'type' => 'unsignedBigInteger', 'nullable' => true],
    ['table' => 'users',   'column' => 'driver_id',  'type' => 'unsignedBigInteger', 'nullable' => true],
    ['table' => 'users',   'column' => 'phone',      'type' => 'string',  'args' => [24], 'nullable' => true],
    ['table' => 'drivers', 'column' => 'deleted_at', 'type' => 'softDeletes'],
    ['table' => 'drivers', 'column' => 'user_id',    'type' => 'unsignedBigInteger', 'nullable' => true],
    ['table' => 'shipments', 'column' => 'intake_photo', 'type' => 'string', 'args' => [255], 'nullable' => true],
];

echo "deploy-fix.php — " . date('Y-m-d H:i:s') . "\n";

foreach ($fixes as $fix) {
    $table = $fix['table'];
    $column = $fix['column'];

    if (!Schema::hasTable($table)) {
        echo "SKIP: tabla '$table' no existe\n";
        continue;
    }

    if (Schema::hasColumn($table, $column)) {
        echo "OK: $table.$column ya existe\n";
    } else {
        try {
            Schema::table($table, function (Blueprint $t) use ($fix) {
                if ($fix['type'] === 'softDeletes') {
                    $t->softDeletes();
                } elseif ($fix['type'] === 'string') {
                    $col = $t->string($fix['column'], ...($fix['args'] ?? []));
                    if (!empty($fix['nullable'])) $col->nullable();
                } else {
                    $col = $t->{$fix['type']}($fix['column']);
                    if (!empty($fix['nullable'])) $col->nullable();
                }
            });
            echo "ADDED: $table.$column\n";
        } catch (Exception $e) {
            echo "ERROR: $table.$column - " . $e->getMessage() . "\n";
        }
    }
}

echo "Done.\n";
