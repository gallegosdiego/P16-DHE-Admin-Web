<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            $table->date('driver_license_expires_at')->nullable()->after('driver_license_photo');
            $table->date('soat_expires_at')->nullable()->after('soat_photo');
            $table->date('technical_inspection_expires_at')->nullable()->after('technical_inspection_photo');
        });
    }

    public function down(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            $table->dropColumn([
                'driver_license_expires_at',
                'soat_expires_at',
                'technical_inspection_expires_at',
            ]);
        });
    }
};
