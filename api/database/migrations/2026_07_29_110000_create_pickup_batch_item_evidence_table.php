<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('pickup_batch_item_evidence')) {
            return;
        }

        Schema::create('pickup_batch_item_evidence', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_batch_item_id')
                ->constrained('pickup_batch_items')
                ->cascadeOnDelete();
            $table->string('evidence_type', 64)->default('reception_difference_photo');
            $table->string('original_path', 500);
            $table->string('sealed_path', 500)->nullable();
            $table->string('sha256', 64);
            $table->string('mime_type', 120)->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->string('source', 48)->default('admin');
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->timestamp('captured_at')->nullable();
            $table->timestamp('received_at');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('metadata_json')->nullable();
            $table->timestamps();

            // Nombre explicito: el generado ocupa 67 caracteres.
            $table->index(['pickup_batch_item_id', 'evidence_type'], 'pbie_item_type_index');
            $table->index('sha256');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pickup_batch_item_evidence');
    }
};
