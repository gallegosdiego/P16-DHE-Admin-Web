<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Agregar columna para foto de recepción del paquete
        if (!Schema::hasColumn('shipments', 'intake_photo')) {
            Schema::table('shipments', function (Blueprint $table) {
                $table->string('intake_photo', 255)->nullable()->after('evidence_photo');
            });
        }

        // Agregar 'mercado_libre' al ENUM de payment_type
        // Solo se ignora en SQLite (tests); en MySQL errores reales sí propagan
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE shipments MODIFY COLUMN payment_type ENUM('cash_on_delivery','post_sale','prepaid','mercado_libre') DEFAULT 'cash_on_delivery'");
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('shipments', 'intake_photo')) {
            Schema::table('shipments', function (Blueprint $table) {
                $table->dropColumn('intake_photo');
            });
        }

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE shipments MODIFY COLUMN payment_type ENUM('cash_on_delivery','post_sale','prepaid') DEFAULT 'cash_on_delivery'");
        }
    }
};
