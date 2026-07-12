<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('driver_cod_obligations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained()->restrictOnDelete();
            $table->foreignId('client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->foreignId('shipment_id')->constrained()->restrictOnDelete();
            $table->foreignId('delivery_attempt_id')->nullable()->constrained('delivery_attempts')->nullOnDelete();
            $table->date('collection_date');
            $table->unsignedBigInteger('expected_amount')->default(0);
            $table->unsignedBigInteger('collected_amount')->default(0);
            $table->unsignedBigInteger('remitted_amount')->default(0);
            $table->string('payment_method', 40)->nullable();
            $table->string('status', 32)->default('pending');
            $table->timestamp('reported_at')->nullable();
            $table->timestamp('fully_remitted_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['driver_id', 'shipment_id']);
            $table->index(['driver_id', 'status', 'collection_date']);
        });

        Schema::create('driver_cod_remittances', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 48)->unique();
            $table->foreignId('driver_id')->constrained()->restrictOnDelete();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('amount');
            $table->unsignedBigInteger('allocated_amount')->default(0);
            $table->string('method', 40)->default('cash');
            $table->string('external_reference', 120)->nullable();
            $table->string('status', 32)->default('received');
            $table->timestamp('received_at');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['driver_id', 'received_at']);
        });

        Schema::create('driver_cod_remittance_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('remittance_id')->constrained('driver_cod_remittances')->cascadeOnDelete();
            $table->foreignId('obligation_id')->constrained('driver_cod_obligations')->restrictOnDelete();
            $table->unsignedBigInteger('amount');
            $table->timestamps();

            $table->unique(['remittance_id', 'obligation_id']);
        });

        Schema::create('driver_service_earnings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained()->restrictOnDelete();
            $table->foreignId('shipment_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('operational_task_id')->nullable()->constrained()->nullOnDelete();
            $table->date('earned_date');
            $table->unsignedBigInteger('amount');
            $table->unsignedBigInteger('paid_amount')->default(0);
            $table->string('service_type', 40)->default('delivery');
            $table->string('status', 32)->default('pending');
            $table->timestamp('fully_paid_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['driver_id', 'shipment_id', 'service_type']);
            $table->index(['driver_id', 'status', 'earned_date']);
        });

        Schema::create('driver_service_payments', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 48)->unique();
            $table->foreignId('driver_id')->constrained()->restrictOnDelete();
            $table->foreignId('paid_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('amount');
            $table->unsignedBigInteger('allocated_amount')->default(0);
            $table->string('method', 40)->default('cash');
            $table->string('external_reference', 120)->nullable();
            $table->timestamp('paid_at');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['driver_id', 'paid_at']);
        });

        Schema::create('driver_service_payment_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_id')->constrained('driver_service_payments')->cascadeOnDelete();
            $table->foreignId('earning_id')->constrained('driver_service_earnings')->restrictOnDelete();
            $table->unsignedBigInteger('amount');
            $table->timestamps();

            $table->unique(['payment_id', 'earning_id']);
        });

        Schema::create('client_cod_entitlements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained('clients')->restrictOnDelete();
            $table->foreignId('shipment_id')->constrained()->restrictOnDelete();
            $table->foreignId('driver_cod_obligation_id')->nullable()->constrained('driver_cod_obligations')->nullOnDelete();
            $table->unsignedBigInteger('reported_amount')->default(0);
            $table->unsignedBigInteger('available_amount')->default(0);
            $table->unsignedBigInteger('transferred_amount')->default(0);
            $table->string('status', 32)->default('reported');
            $table->timestamp('available_at')->nullable();
            $table->timestamp('fully_transferred_at')->nullable();
            $table->timestamps();

            $table->unique('shipment_id');
            $table->index(['client_id', 'status']);
        });

        Schema::create('client_cod_payouts', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 48)->unique();
            $table->foreignId('client_id')->constrained('clients')->restrictOnDelete();
            $table->foreignId('paid_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('amount');
            $table->unsignedBigInteger('allocated_amount')->default(0);
            $table->string('method', 40)->default('bank_transfer');
            $table->string('external_reference', 120)->nullable();
            $table->timestamp('paid_at');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['client_id', 'paid_at']);
        });

        Schema::create('client_cod_payout_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payout_id')->constrained('client_cod_payouts')->cascadeOnDelete();
            $table->foreignId('entitlement_id')->constrained('client_cod_entitlements')->restrictOnDelete();
            $table->unsignedBigInteger('amount');
            $table->timestamps();

            $table->unique(['payout_id', 'entitlement_id']);
        });

        Schema::create('payment_intents', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('shipment_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->unsignedBigInteger('amount');
            $table->string('purpose', 40)->default('cod_delivery');
            $table->string('provider', 40)->default('nequi');
            $table->string('status', 32)->default('pending');
            $table->text('qr_payload')->nullable();
            $table->string('provider_reference', 120)->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();

            $table->index(['shipment_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_intents');
        Schema::dropIfExists('client_cod_payout_allocations');
        Schema::dropIfExists('client_cod_payouts');
        Schema::dropIfExists('client_cod_entitlements');
        Schema::dropIfExists('driver_service_payment_allocations');
        Schema::dropIfExists('driver_service_payments');
        Schema::dropIfExists('driver_service_earnings');
        Schema::dropIfExists('driver_cod_remittance_allocations');
        Schema::dropIfExists('driver_cod_remittances');
        Schema::dropIfExists('driver_cod_obligations');
    }
};
