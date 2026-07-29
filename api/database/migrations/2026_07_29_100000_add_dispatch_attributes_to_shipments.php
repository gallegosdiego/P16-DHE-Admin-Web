<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('shipments', 'size_code')) {
            Schema::table('shipments', function (Blueprint $table): void {
                $table->string('size_code', 40)->nullable()->after('recipient_city');
            });
        }

        if (! Schema::hasColumn('shipments', 'is_fragile')) {
            Schema::table('shipments', function (Blueprint $table): void {
                $table->boolean('is_fragile')->default(false)->after('size_code');
            });
        }

        if (! Schema::hasColumn('shipments', 'approx_weight_kg')) {
            Schema::table('shipments', function (Blueprint $table): void {
                $table->decimal('approx_weight_kg', 8, 2)->nullable()->after('is_fragile');
            });
        }
    }

    public function down(): void
    {
        $columns = array_values(array_filter([
            Schema::hasColumn('shipments', 'approx_weight_kg') ? 'approx_weight_kg' : null,
            Schema::hasColumn('shipments', 'is_fragile') ? 'is_fragile' : null,
            Schema::hasColumn('shipments', 'size_code') ? 'size_code' : null,
        ]));

        if ($columns !== []) {
            Schema::table('shipments', function (Blueprint $table) use ($columns): void {
                $table->dropColumn($columns);
            });
        }
    }
};
