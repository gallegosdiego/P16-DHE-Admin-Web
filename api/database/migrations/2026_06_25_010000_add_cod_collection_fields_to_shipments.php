<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            if (! Schema::hasColumn('shipments', 'cod_collected_amount')) {
                $table->decimal('cod_collected_amount', 12, 0)->nullable();
            }
            if (! Schema::hasColumn('shipments', 'cod_payment_method')) {
                $table->string('cod_payment_method', 40)->nullable();
            }
            if (! Schema::hasColumn('shipments', 'cod_collected_at')) {
                $table->timestamp('cod_collected_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            if (Schema::hasColumn('shipments', 'cod_collected_at')) {
                $table->dropColumn('cod_collected_at');
            }
            if (Schema::hasColumn('shipments', 'cod_payment_method')) {
                $table->dropColumn('cod_payment_method');
            }
            if (Schema::hasColumn('shipments', 'cod_collected_amount')) {
                $table->dropColumn('cod_collected_amount');
            }
        });
    }
};
