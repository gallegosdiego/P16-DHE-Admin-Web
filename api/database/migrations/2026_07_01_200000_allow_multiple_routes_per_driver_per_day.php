<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * El índice único `routes_driver_id_route_date_unique` impide que un piloto
     * tenga más de una ruta el mismo día. Idempotente porque esta migración
     * nunca llegó a producción y debe poder aplicarse sobre una base donde el
     * índice sigue presente o donde ya fue retirado a mano.
     */
    public function up(): void
    {
        if (Schema::hasIndex('routes', ['driver_id', 'route_date'], 'unique')) {
            Schema::table('routes', function (Blueprint $table) {
                $table->dropUnique(['driver_id', 'route_date']);
            });
        }

        if (! Schema::hasIndex('routes', 'routes_driver_id_route_date_index')) {
            Schema::table('routes', function (Blueprint $table) {
                $table->index(['driver_id', 'route_date']);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasIndex('routes', 'routes_driver_id_route_date_index')) {
            Schema::table('routes', function (Blueprint $table) {
                $table->dropIndex(['driver_id', 'route_date']);
            });
        }

        if (! Schema::hasIndex('routes', ['driver_id', 'route_date'], 'unique')) {
            Schema::table('routes', function (Blueprint $table) {
                $table->unique(['driver_id', 'route_date']);
            });
        }
    }
};
