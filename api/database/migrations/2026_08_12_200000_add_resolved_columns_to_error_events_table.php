<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Añade columnas para marcar un incidente como resuelto/archivado.
 *
 * `resolved_at` indica cuándo se resolvió; `resolved_by` quién lo hizo.
 * Ambas son nullable: un evento sin resolver tiene ambas en NULL.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('error_events', function (Blueprint $table) {
            if (! Schema::hasColumn('error_events', 'resolved_at')) {
                $table->timestamp('resolved_at')->nullable()->after('occurred_at');
            }

            if (! Schema::hasColumn('error_events', 'resolved_by')) {
                $table->foreignId('resolved_by')->nullable()->after('resolved_at')
                    ->constrained('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('error_events', function (Blueprint $table) {
            if (Schema::hasColumn('error_events', 'resolved_by')) {
                $table->dropForeign(['resolved_by']);
                $table->dropColumn('resolved_by');
            }

            if (Schema::hasColumn('error_events', 'resolved_at')) {
                $table->dropColumn('resolved_at');
            }
        });
    }
};
