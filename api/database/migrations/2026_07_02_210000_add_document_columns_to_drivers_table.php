<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            $table->string('driver_license_photo')->nullable()->after('zone');
            $table->string('vehicle_registration_photo')->nullable()->after('driver_license_photo');
            $table->string('soat_photo')->nullable()->after('vehicle_registration_photo');
            $table->string('technical_inspection_photo')->nullable()->after('soat_photo');
            $table->string('national_id_front_photo')->nullable()->after('technical_inspection_photo');
            $table->string('national_id_back_photo')->nullable()->after('national_id_front_photo');
        });
    }

    public function down(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            $table->dropColumn([
                'driver_license_photo',
                'vehicle_registration_photo',
                'soat_photo',
                'technical_inspection_photo',
                'national_id_front_photo',
                'national_id_back_photo',
            ]);
        });
    }
};
