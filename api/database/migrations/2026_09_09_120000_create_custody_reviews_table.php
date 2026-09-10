<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('custody_reviews', function (Blueprint $t) {
            $t->id();
            $t->foreignId('shipment_id')->constrained()->cascadeOnDelete();
            $t->string('type', 50);
            $t->foreignId('previous_driver_id')->nullable()->constrained('drivers')->nullOnDelete();
            $t->foreignId('new_driver_id')->nullable()->constrained('drivers')->nullOnDelete();
            $t->foreignId('custody_event_id')->nullable()->constrained('custody_events')->nullOnDelete();
            $t->string('status', 20)->default('pending');
            $t->timestamp('occurred_at');
            $t->foreignId('acknowledged_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('acknowledged_at')->nullable();
            $t->json('metadata')->nullable();
            $t->timestamps();
            $t->index(['status', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('custody_reviews');
    }
};
