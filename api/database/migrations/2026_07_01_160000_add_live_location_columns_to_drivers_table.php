<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            $table->decimal('last_lat', 10, 7)->nullable()->after('zone');
            $table->decimal('last_lng', 10, 7)->nullable()->after('last_lat');
            $table->decimal('last_heading', 8, 2)->nullable()->after('last_lng');
            $table->decimal('last_speed', 8, 2)->nullable()->after('last_heading');
            $table->timestamp('last_location_updated_at')->nullable()->after('last_speed');

            $table->index('last_location_updated_at');
        });
    }

    public function down(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            $table->dropIndex(['last_location_updated_at']);
            $table->dropColumn([
                'last_lat',
                'last_lng',
                'last_heading',
                'last_speed',
                'last_location_updated_at',
            ]);
        });
    }
};
