<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('app_settings')) {
            return;
        }

        Schema::create('app_settings', function (Blueprint $table) {
            $table->id();
            // Clave del catálogo cerrado en IntegrationSettingDefinitions.
            $table->string('key', 120)->unique();
            // Cifrado en reposo con APP_KEY, que vive en .env y NO en la base:
            // un volcado robado por sí solo no revela ninguna credencial.
            $table->text('value')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_settings');
    }
};
