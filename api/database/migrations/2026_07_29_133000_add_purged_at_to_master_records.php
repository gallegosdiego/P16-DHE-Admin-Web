<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['clients', 'drivers', 'users'] as $tableName) {
            if (! Schema::hasTable($tableName) || Schema::hasColumn($tableName, 'purged_at')) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table): void {
                $table->timestamp('purged_at')->nullable()->index();
            });
        }
    }

    public function down(): void
    {
        foreach (['clients', 'drivers', 'users'] as $tableName) {
            if (! Schema::hasTable($tableName) || ! Schema::hasColumn($tableName, 'purged_at')) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropColumn('purged_at');
            });
        }
    }
};
