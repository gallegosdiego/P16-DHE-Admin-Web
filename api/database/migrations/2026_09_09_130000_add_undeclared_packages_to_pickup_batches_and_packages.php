<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('pickup_batches')) {
            Schema::table('pickup_batches', function (Blueprint $table): void {
                if (! Schema::hasColumn('pickup_batches', 'undeclared_packages')) {
                    $table->unsignedInteger('undeclared_packages')->default(0)->after('missing_packages');
                }
            });
        }

        if (Schema::hasTable('pickup_packages')) {
            Schema::table('pickup_packages', function (Blueprint $table): void {
                if (! Schema::hasColumn('pickup_packages', 'added_at_reception_at')) {
                    $table->timestamp('added_at_reception_at')->nullable()->after('qr_reference');
                }
            });
        }
    }

    public function down(): void
    {
        // Migración aditiva: no se eliminan columnas compartidas en rollback
    }
};
