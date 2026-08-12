<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fecha de última rotación de cada credencial.
 *
 * Idea tomada de CarriRoad, que ya resolvía esto en su modelo `ApiCredential`
 * con `last_rotated_at`. Saber que un token lleva ocho meses sin cambiarse es
 * información operativa útil: `updated_at` no sirve porque cambia también
 * cuando se toca cualquier otro campo.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('app_settings') || Schema::hasColumn('app_settings', 'last_rotated_at')) {
            return;
        }

        Schema::table('app_settings', function (Blueprint $table) {
            $table->timestamp('last_rotated_at')->nullable()->after('value');
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('app_settings') && Schema::hasColumn('app_settings', 'last_rotated_at')) {
            Schema::table('app_settings', function (Blueprint $table) {
                $table->dropColumn('last_rotated_at');
            });
        }
    }
};
