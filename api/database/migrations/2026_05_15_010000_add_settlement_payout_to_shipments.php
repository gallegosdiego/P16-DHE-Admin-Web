<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Vincular envíos con conciliaciones y pagos a conductores
        Schema::table('shipments', function (Blueprint $table) {
            $table->foreignId('settlement_id')->nullable()->after('driver_paid')
                ->constrained('cod_settlements')->nullOnDelete();
            $table->foreignId('payout_id')->nullable()->after('settlement_id')
                ->constrained('driver_payouts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('settlement_id');
            $table->dropConstrainedForeignId('payout_id');
        });
    }
};
