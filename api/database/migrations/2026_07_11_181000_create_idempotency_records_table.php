<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('idempotency_records', function (Blueprint $table) {
            $table->id();
            $table->string('scope', 120);
            $table->string('idempotency_key', 191);
            $table->string('operation', 120);
            $table->string('request_hash', 64);
            $table->string('status', 24)->default('processing');
            $table->string('result_type', 191)->nullable();
            $table->unsignedBigInteger('result_id')->nullable();
            $table->json('response_json')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->unique(['scope', 'idempotency_key', 'operation'], 'idempotency_operation_unique');
            $table->index(['result_type', 'result_id']);
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('idempotency_records');
    }
};
