<?php

/**
 * Script de reparación para deploy en producción.
 * Agrega columnas faltantes que el migrate --force no pudo crear.
 * 
 * Uso: php deploy-fix.php
 */

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;

$fixes = [
    ['table' => 'users', 'column' => 'deleted_at', 'type' => 'softDeletes'],
    ['table' => 'drivers', 'column' => 'deleted_at', 'type' => 'softDeletes'],
    ['table' => 'users', 'column' => 'driver_id', 'type' => 'unsignedBigInteger', 'nullable' => true],
    ['table' => 'drivers', 'column' => 'user_id', 'type' => 'unsignedBigInteger', 'nullable' => true],
];

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

echo "\nDone.\n";
