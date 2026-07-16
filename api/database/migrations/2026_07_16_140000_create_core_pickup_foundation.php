<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('service_locations')) {
            Schema::create('service_locations', function (Blueprint $table): void {
                $table->id();
                $table->string('code', 40)->unique();
                $table->string('name', 120);
                $table->string('location_type', 40)->default('danhei_hub');
                $table->string('address_line1', 200);
                $table->string('address_complement', 120)->nullable();
                $table->string('zone', 60)->nullable();
                $table->string('city', 60)->default('Bogotá');
                $table->decimal('lat', 10, 7)->nullable();
                $table->decimal('lng', 10, 7)->nullable();
                $table->string('timezone', 60)->default('America/Bogota');
                $table->json('opening_hours_json')->nullable();
                $table->json('capabilities_json')->nullable();
                $table->string('contact_name', 120)->nullable();
                $table->string('contact_phone', 24)->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->softDeletes();

                $table->index(['city', 'is_active']);
            });
        }

        if (! Schema::hasTable('pickup_requests')) {
            Schema::create('pickup_requests', function (Blueprint $table): void {
                $table->id();
                $table->string('pickup_code', 40)->unique();
                $table->foreignId('customer_id')->constrained('clients')->restrictOnDelete();
                // Integración opcional: se conserva la referencia sin hacer depender
                // el ingreso operativo de las tablas de WhatsApp.
                $table->unsignedBigInteger('customer_whatsapp_contact_id')->nullable()->index();
                $table->string('source', 32)->default('admin');
                $table->string('intake_mode', 48)->default('pickup_at_client_location');
                $table->foreignId('service_location_id')->nullable()->constrained('service_locations')->nullOnDelete();
                $table->timestamp('planned_dropoff_at')->nullable();
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
                $table->index(['intake_mode', 'status']);
                $table->index('coverage_status');
            });
        }

        if (! Schema::hasTable('pickup_packages')) {
            Schema::create('pickup_packages', function (Blueprint $table): void {
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
        }

        if (! Schema::hasTable('pickup_review_events')) {
            Schema::create('pickup_review_events', function (Blueprint $table): void {
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
    }

    public function down(): void
    {
        // Reparación aditiva: no elimina tablas compartidas en un rollback.
    }
};
