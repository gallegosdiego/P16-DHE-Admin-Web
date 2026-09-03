<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('pickup_packages') && ! Schema::hasColumn('pickup_packages', 'payment_type')) {
            Schema::table('pickup_packages', function (Blueprint $table): void {
                $table->string('payment_type', 40)->nullable()->after('requested_cod_amount');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('pickup_packages') && Schema::hasColumn('pickup_packages', 'payment_type')) {
            Schema::table('pickup_packages', function (Blueprint $table): void {
                $table->dropColumn('payment_type');
            });
        }
    }
};
