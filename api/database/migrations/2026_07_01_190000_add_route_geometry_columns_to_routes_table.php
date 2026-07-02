<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('routes', function (Blueprint $table) {
            $table->longText('overview_polyline')->nullable()->after('origin_lng');
            $table->json('route_legs')->nullable()->after('overview_polyline');
        });
    }

    public function down(): void
    {
        Schema::table('routes', function (Blueprint $table) {
            $table->dropColumn([
                'overview_polyline',
                'route_legs',
            ]);
        });
    }
};
