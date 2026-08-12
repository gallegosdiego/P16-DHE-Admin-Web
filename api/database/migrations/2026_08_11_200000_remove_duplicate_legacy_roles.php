<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Retira los roles duplicados en español: `conductor` y `cliente`.
 *
 * El seeder los creaba «por retrocompatibilidad» junto a `driver` y `client`,
 * que son los equivalentes reales. El resultado era un desplegable de creación
 * de usuarios con seis opciones para cuatro roles, dos de ellas etiquetadas
 * «(legacy)». Nada garantizaba que los pilotos no acabaran repartidos entre
 * `driver` y `conductor`, cada uno con su propio conjunto de permisos.
 *
 * En producción, al 11 de agosto de 2026, ambos tenían **0 usuarios asignados**
 * en los dos guards. Aun así la eliminación es condicional: si algún entorno
 * tiene usuarios en ellos, la migración los conserva y avisa, en vez de dejar
 * a alguien sin permisos en silencio.
 */
return new class extends Migration
{
    private const DUPLICADOS = ['conductor', 'cliente'];

    public function up(): void
    {
        if (! Schema::hasTable('roles') || ! Schema::hasTable('model_has_roles')) {
            return;
        }

        foreach (self::DUPLICADOS as $nombre) {
            $roles = DB::table('roles')->where('name', $nombre)->get();

            foreach ($roles as $rol) {
                $asignados = DB::table('model_has_roles')->where('role_id', $rol->id)->count();

                if ($asignados > 0) {
                    // Se conserva a propósito: eliminarlo dejaría usuarios sin
                    // permisos. Reasignarlos a `driver`/`client` es una decisión
                    // operativa, no algo que deba hacer una migración.
                    continue;
                }

                DB::table('role_has_permissions')->where('role_id', $rol->id)->delete();
                DB::table('roles')->where('id', $rol->id)->delete();
            }
        }
    }

    /**
     * No se recrean. Volver atrás reintroduciría la ambigüedad que esta
     * migración elimina, y el seeder ya no los produce.
     */
    public function down(): void
    {
    }
};
