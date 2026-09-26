<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Contrato 2026-09-26-B §1: cuando el piloto A ya arrancó ruta con el paquete,
 * el traspaso a B espera a que A acepte (o que administración lo apruebe).
 *
 * Aditiva: solo crea una tabla nueva, no toca datos existentes.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('custody_transfer_requests')) {
            return;
        }

        Schema::create('custody_transfer_requests', function (Blueprint $t) {
            $t->id();
            $t->foreignId('shipment_id')->constrained()->cascadeOnDelete();
            $t->foreignId('from_driver_id')->constrained('drivers')->cascadeOnDelete();
            $t->foreignId('to_driver_id')->constrained('drivers')->cascadeOnDelete();
            // pending|accepted|rejected|expired|cancelled|approved_by_admin
            $t->string('status', 20)->default('pending');
            $t->foreignId('requested_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('responded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('reason', 500)->nullable();
            $t->timestamp('requested_at')->nullable();
            $t->timestamp('responded_at')->nullable();
            $t->timestamp('expires_at')->nullable();
            $t->foreignId('custody_event_id')->nullable()->constrained('custody_events')->nullOnDelete();
            $t->json('metadata_json')->nullable();
            $t->timestamps();
            $t->index(['from_driver_id', 'status'], 'ctr_from_status_idx');
            $t->index(['to_driver_id', 'status'], 'ctr_to_status_idx');
            $t->index(['shipment_id', 'status'], 'ctr_shipment_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('custody_transfer_requests');
    }
};
