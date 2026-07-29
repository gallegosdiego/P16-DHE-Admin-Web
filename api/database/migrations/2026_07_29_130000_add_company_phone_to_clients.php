<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('clients') && ! Schema::hasColumn('clients', 'company_phone')) {
            Schema::table('clients', function (Blueprint $table): void {
                $table->string('company_phone', 24)->nullable()->after('company');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('clients') && Schema::hasColumn('clients', 'company_phone')) {
            Schema::table('clients', function (Blueprint $table): void {
                $table->dropColumn('company_phone');
            });
        }
    }
};
