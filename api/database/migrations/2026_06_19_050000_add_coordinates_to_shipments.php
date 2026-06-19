<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            if (! Schema::hasColumn('shipments', 'recipient_lat')) {
                $table->decimal('recipient_lat', 10, 7)->nullable()->after('recipient_city');
            }
            if (! Schema::hasColumn('shipments', 'recipient_lng')) {
                $table->decimal('recipient_lng', 10, 7)->nullable()->after('recipient_lat');
            }
            if (! Schema::hasColumn('shipments', 'geocoded_at')) {
                $table->timestamp('geocoded_at')->nullable()->after('recipient_lng');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->dropColumn(['recipient_lat', 'recipient_lng', 'geocoded_at']);
        });
    }
};
