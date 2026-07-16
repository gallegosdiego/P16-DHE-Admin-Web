<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('operational_tasks', function (Blueprint $table) {
            $table->foreignId('assigned_user_id')
                ->nullable()
                ->after('assigned_driver_id')
                ->constrained('users')
                ->nullOnDelete();

            $table->index(['assigned_user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('operational_tasks', function (Blueprint $table) {
            $table->dropIndex(['assigned_user_id', 'status']);
            $table->dropConstrainedForeignId('assigned_user_id');
        });
    }
};
