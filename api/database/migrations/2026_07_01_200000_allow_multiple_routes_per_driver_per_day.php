<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('routes', function (Blueprint $table) {
            $table->dropUnique(['driver_id', 'route_date']);
            $table->index(['driver_id', 'route_date']);
        });
    }

    public function down(): void
    {
        Schema::table('routes', function (Blueprint $table) {
            $table->dropIndex(['driver_id', 'route_date']);
            $table->unique(['driver_id', 'route_date']);
        });
    }
};
