<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('routes', function (Blueprint $table) {
            $table->unsignedInteger('optimized_distance_meters')->nullable()->after('completed_stops');
            $table->unsignedInteger('optimized_duration_seconds')->nullable()->after('optimized_distance_meters');
            $table->unsignedInteger('remaining_distance_meters')->nullable()->after('optimized_duration_seconds');
            $table->unsignedInteger('remaining_duration_seconds')->nullable()->after('remaining_distance_meters');
            $table->string('optimization_source', 40)->nullable()->after('remaining_duration_seconds');
            $table->timestamp('optimized_at')->nullable()->after('optimization_source');
            $table->decimal('origin_lat', 10, 7)->nullable()->after('optimized_at');
            $table->decimal('origin_lng', 10, 7)->nullable()->after('origin_lat');
        });
    }

    public function down(): void
    {
        Schema::table('routes', function (Blueprint $table) {
            $table->dropColumn([
                'optimized_distance_meters',
                'optimized_duration_seconds',
                'remaining_distance_meters',
                'remaining_duration_seconds',
                'optimization_source',
                'optimized_at',
                'origin_lat',
                'origin_lng',
            ]);
        });
    }
};
