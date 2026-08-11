<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Idempotente por necesidad: en producción las cinco columnas ya existen
     * porque las creó `scripts/repair-driver-mobile-geo-schema.php` fuera del
     * sistema de migraciones, pero el índice nunca se llegó a crear.
     */
    public function up(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            if (! Schema::hasColumn('drivers', 'last_lat')) {
                $table->decimal('last_lat', 10, 7)->nullable()->after('zone');
            }
            if (! Schema::hasColumn('drivers', 'last_lng')) {
                $table->decimal('last_lng', 10, 7)->nullable()->after('last_lat');
            }
            if (! Schema::hasColumn('drivers', 'last_heading')) {
                $table->decimal('last_heading', 8, 2)->nullable()->after('last_lng');
            }
            if (! Schema::hasColumn('drivers', 'last_speed')) {
                $table->decimal('last_speed', 8, 2)->nullable()->after('last_heading');
            }
            if (! Schema::hasColumn('drivers', 'last_location_updated_at')) {
                $table->timestamp('last_location_updated_at')->nullable()->after('last_speed');
            }
        });

        if (! Schema::hasIndex('drivers', 'drivers_last_location_updated_at_index')) {
            Schema::table('drivers', function (Blueprint $table) {
                $table->index('last_location_updated_at');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasIndex('drivers', 'drivers_last_location_updated_at_index')) {
            Schema::table('drivers', function (Blueprint $table) {
                $table->dropIndex(['last_location_updated_at']);
            });
        }

        Schema::table('drivers', function (Blueprint $table) {
            foreach ([
                'last_lat',
                'last_lng',
                'last_heading',
                'last_speed',
                'last_location_updated_at',
            ] as $column) {
                if (Schema::hasColumn('drivers', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
