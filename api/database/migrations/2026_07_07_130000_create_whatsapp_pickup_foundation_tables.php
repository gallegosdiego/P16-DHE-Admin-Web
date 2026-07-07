<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_whatsapp_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('clients')->cascadeOnDelete();
            $table->string('status', 32)->default('DISABLED');
            $table->boolean('cod_enabled')->default(false);
            $table->unsignedInteger('automatic_package_limit')->default(5);
            $table->unsignedInteger('manual_review_package_limit')->default(20);
            $table->unsignedInteger('automatic_cod_limit')->default(500000);
            $table->unsignedInteger('manual_review_cod_limit')->default(1000000);
            $table->unsignedInteger('automatic_cod_total_limit')->default(2000000);
            $table->json('allowed_windows_json')->nullable();
            $table->foreignId('default_pickup_address_id')->nullable()->constrained('client_addresses')->nullOnDelete();
            $table->timestamp('activated_at')->nullable();
            $table->foreignId('activated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('suspended_at')->nullable();
            $table->foreignId('suspended_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('suspension_reason', 120)->nullable();
            $table->timestamps();

            $table->unique('customer_id');
            $table->index('status');
        });

        Schema::create('whatsapp_contacts', function (Blueprint $table) {
            $table->id();
            $table->string('wa_id', 64)->unique();
            $table->string('phone', 24)->nullable();
            $table->string('display_name', 120)->nullable();
            $table->string('verification_status', 32)->default('UNKNOWN');
            $table->timestamp('last_verified_at')->nullable();
            $table->timestamp('blocked_at')->nullable();
            $table->timestamps();

            $table->index('phone');
        });

        Schema::create('customer_whatsapp_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('clients')->cascadeOnDelete();
            $table->foreignId('whatsapp_contact_id')->constrained('whatsapp_contacts')->cascadeOnDelete();
            $table->string('role', 60)->nullable();
            $table->string('status', 32)->default('PENDING');
            $table->timestamp('authorized_at')->nullable();
            $table->foreignId('authorized_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['customer_id', 'whatsapp_contact_id']);
            $table->index(['customer_id', 'status']);
        });

        Schema::create('customer_whatsapp_contact_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_whatsapp_contact_id')->constrained('customer_whatsapp_contacts')->cascadeOnDelete();
            $table->string('permission', 64);
            $table->timestamp('created_at')->nullable();

            $table->unique(['customer_whatsapp_contact_id', 'permission'], 'cwac_permission_unique');
        });

        Schema::create('whatsapp_link_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('whatsapp_contact_id')->constrained('whatsapp_contacts')->cascadeOnDelete();
            $table->foreignId('requested_customer_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->string('requested_company_name', 120)->nullable();
            $table->string('status', 32)->default('PENDING');
            $table->string('requested_by_phone', 24)->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->string('rejection_reason', 120)->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index('whatsapp_contact_id');
        });

        Schema::create('whatsapp_webhook_inbox', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 32);
            $table->string('external_event_id', 191)->nullable();
            $table->string('event_type', 64);
            $table->string('payload_hash', 64);
            $table->boolean('signature_valid')->default(false);
            $table->string('processing_status', 32)->default('RECEIVED');
            $table->timestamp('received_at');
            $table->timestamp('processed_at')->nullable();
            $table->string('correlation_id', 80)->unique();
            $table->json('payload_json');
            $table->json('headers_json')->nullable();
            $table->string('error_code', 80)->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->unique(['provider', 'external_event_id']);
            $table->index(['processing_status', 'received_at']);
            $table->index('payload_hash');
        });

        Schema::create('whatsapp_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('whatsapp_contact_id')->nullable()->constrained('whatsapp_contacts')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->string('direction', 16);
            $table->string('provider_message_id', 191)->nullable()->unique();
            $table->string('message_type', 32);
            $table->string('message_status', 32)->nullable();
            $table->string('related_entity_type', 80)->nullable();
            $table->unsignedBigInteger('related_entity_id')->nullable();
            $table->string('correlation_id', 80)->index();
            $table->json('payload_json');
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->timestamps();

            $table->index(['whatsapp_contact_id', 'created_at']);
            $table->index(['related_entity_type', 'related_entity_id']);
        });

        Schema::create('whatsapp_flow_submissions', function (Blueprint $table) {
            $table->id();
            $table->string('submission_id', 191)->unique();
            $table->string('flow_id', 120);
            $table->foreignId('whatsapp_contact_id')->nullable()->constrained('whatsapp_contacts')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->unsignedBigInteger('pickup_request_id')->nullable();
            $table->string('status', 32)->default('RECEIVED');
            $table->json('payload_json');
            $table->string('payload_hash', 64);
            $table->timestamp('processed_at')->nullable();
            $table->string('correlation_id', 80)->index();
            $table->timestamps();

            $table->index(['customer_id', 'created_at']);
            $table->index('payload_hash');
        });

        Schema::create('pickup_requests', function (Blueprint $table) {
            $table->id();
            $table->string('pickup_code', 40)->unique();
            $table->foreignId('customer_id')->constrained('clients')->restrictOnDelete();
            $table->foreignId('customer_whatsapp_contact_id')->nullable()->constrained('customer_whatsapp_contacts')->nullOnDelete();
            $table->string('source', 32)->default('whatsapp');
            $table->string('status', 40)->default('draft');
            $table->string('review_reason_code', 80)->nullable();
            $table->string('pickup_address_line1', 200);
            $table->string('pickup_address_complement', 120)->nullable();
            $table->string('pickup_zone', 60)->nullable();
            $table->string('pickup_city', 60)->nullable();
            $table->decimal('pickup_lat', 10, 7)->nullable();
            $table->decimal('pickup_lng', 10, 7)->nullable();
            $table->decimal('pickup_geocoding_confidence', 5, 2)->nullable();
            $table->string('coverage_status', 32)->default('UNRESOLVED');
            $table->string('contact_name', 120);
            $table->string('contact_phone', 24);
            $table->string('pickup_window_code', 40);
            $table->string('pickup_window_label', 120);
            $table->unsignedInteger('package_count')->default(1);
            $table->unsignedBigInteger('requested_cod_total')->default(0);
            $table->text('special_instructions')->nullable();
            $table->string('correlation_id', 80)->index();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('ready_for_assignment_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'status']);
            $table->index(['status', 'created_at']);
            $table->index('coverage_status');
        });

        Schema::table('whatsapp_flow_submissions', function (Blueprint $table) {
            $table->foreign('pickup_request_id')
                ->references('id')
                ->on('pickup_requests')
                ->nullOnDelete();
        });

        Schema::create('pickup_packages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pickup_request_id')->constrained('pickup_requests')->cascadeOnDelete();
            $table->unsignedInteger('package_index');
            $table->string('recipient_name', 120);
            $table->string('recipient_phone', 24);
            $table->string('delivery_address_line1', 200);
            $table->string('delivery_address_complement', 120)->nullable();
            $table->string('delivery_zone', 60)->nullable();
            $table->string('delivery_city', 60)->nullable();
            $table->decimal('delivery_lat', 10, 7)->nullable();
            $table->decimal('delivery_lng', 10, 7)->nullable();
            $table->decimal('delivery_geocoding_confidence', 5, 2)->nullable();
            $table->boolean('is_cod')->default(false);
            $table->unsignedBigInteger('requested_cod_amount')->nullable();
            $table->boolean('is_fragile')->default(false);
            $table->string('package_type', 60)->nullable();
            $table->string('size_code', 40)->nullable();
            $table->decimal('approx_weight_kg', 8, 2)->nullable();
            $table->text('special_handling_notes')->nullable();
            $table->foreignId('shipment_id')->nullable()->constrained('shipments')->nullOnDelete();
            $table->string('guide_number', 40)->nullable();
            $table->string('qr_reference', 120)->nullable();
            $table->timestamps();

            $table->unique(['pickup_request_id', 'package_index']);
            $table->index('shipment_id');
        });

        Schema::create('pickup_review_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pickup_request_id')->constrained('pickup_requests')->cascadeOnDelete();
            $table->string('event_type', 64);
            $table->string('reason_code', 80)->nullable();
            $table->text('notes')->nullable();
            $table->json('requested_fields_json')->nullable();
            $table->json('old_values_json')->nullable();
            $table->json('new_values_json')->nullable();
            $table->string('actor_type', 40);
            $table->unsignedBigInteger('actor_id')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamp('created_at')->nullable();

            $table->index(['pickup_request_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pickup_review_events');
        Schema::dropIfExists('pickup_packages');
        Schema::dropIfExists('pickup_requests');
        Schema::dropIfExists('whatsapp_flow_submissions');
        Schema::dropIfExists('whatsapp_messages');
        Schema::dropIfExists('whatsapp_webhook_inbox');
        Schema::dropIfExists('whatsapp_link_requests');
        Schema::dropIfExists('customer_whatsapp_contact_permissions');
        Schema::dropIfExists('customer_whatsapp_contacts');
        Schema::dropIfExists('whatsapp_contacts');
        Schema::dropIfExists('customer_whatsapp_settings');
    }
};
