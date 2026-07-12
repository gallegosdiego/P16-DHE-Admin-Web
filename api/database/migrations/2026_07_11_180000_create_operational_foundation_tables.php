<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_locations', function (Blueprint $table) {
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

        Schema::table('pickup_requests', function (Blueprint $table) {
            $table->string('intake_mode', 48)
                ->default('pickup_at_client_location')
                ->after('source');
            $table->foreignId('service_location_id')
                ->nullable()
                ->after('intake_mode')
                ->constrained('service_locations')
                ->nullOnDelete();
            $table->timestamp('planned_dropoff_at')->nullable()->after('service_location_id');

            $table->index(['intake_mode', 'status']);
        });

        Schema::create('operational_tasks', function (Blueprint $table) {
            $table->id();
            $table->string('task_code', 40)->unique();
            $table->string('task_type', 48);
            $table->string('status', 40)->default('pending');
            $table->unsignedTinyInteger('priority')->default(3);
            $table->foreignId('customer_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->foreignId('pickup_request_id')->nullable()->constrained('pickup_requests')->nullOnDelete();
            $table->foreignId('shipment_id')->nullable()->constrained('shipments')->nullOnDelete();
            $table->foreignId('service_location_id')->nullable()->constrained('service_locations')->nullOnDelete();
            $table->string('assignee_type', 48)->nullable();
            $table->foreignId('assigned_driver_id')->nullable()->constrained('drivers')->nullOnDelete();
            $table->string('assigned_executor_name', 120)->nullable();
            $table->string('assigned_executor_phone', 24)->nullable();
            $table->date('scheduled_date')->nullable();
            $table->timestamp('window_starts_at')->nullable();
            $table->timestamp('window_ends_at')->nullable();
            $table->timestamp('assigned_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('outcome_code', 64)->nullable();
            $table->text('notes')->nullable();
            $table->json('metadata_json')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['task_type', 'status', 'scheduled_date']);
            $table->index(['assigned_driver_id', 'status']);
            $table->index(['pickup_request_id', 'status']);
            $table->index(['shipment_id', 'status']);
        });

        Schema::create('pickup_batches', function (Blueprint $table) {
            $table->id();
            $table->string('batch_code', 40)->unique();
            $table->foreignId('pickup_request_id')->constrained('pickup_requests')->restrictOnDelete();
            $table->foreignId('operational_task_id')->nullable()->constrained('operational_tasks')->nullOnDelete();
            $table->foreignId('service_location_id')->nullable()->constrained('service_locations')->nullOnDelete();
            $table->foreignId('driver_id')->nullable()->constrained('drivers')->nullOnDelete();
            $table->string('intake_mode', 48);
            $table->string('status', 40)->default('open');
            $table->string('executor_type', 48)->nullable();
            $table->string('executor_name', 120)->nullable();
            $table->string('delivered_by_name', 120)->nullable();
            $table->string('delivered_by_phone', 24)->nullable();
            $table->string('delivered_by_relationship', 80)->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('expected_packages')->default(0);
            $table->unsignedInteger('received_packages')->default(0);
            $table->unsignedInteger('rejected_packages')->default(0);
            $table->unsignedInteger('missing_packages')->default(0);
            $table->decimal('arrival_lat', 10, 7)->nullable();
            $table->decimal('arrival_lng', 10, 7)->nullable();
            $table->timestamp('arrived_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->string('confirmation_type', 40)->nullable();
            $table->string('confirmation_reference', 191)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['pickup_request_id', 'status']);
            $table->index(['service_location_id', 'status']);
        });

        Schema::create('pickup_batch_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pickup_batch_id')->constrained('pickup_batches')->cascadeOnDelete();
            $table->foreignId('pickup_package_id')->nullable()->constrained('pickup_packages')->nullOnDelete();
            $table->foreignId('shipment_id')->nullable()->constrained('shipments')->nullOnDelete();
            $table->string('item_reference', 120)->nullable();
            $table->string('result', 40)->default('pending');
            $table->string('physical_condition', 48)->nullable();
            $table->string('exception_code', 64)->nullable();
            $table->text('exception_notes')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['pickup_batch_id', 'pickup_package_id']);
            $table->index(['pickup_batch_id', 'result']);
            $table->index('shipment_id');
        });

        Schema::create('delivery_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipment_id')->constrained('shipments')->restrictOnDelete();
            $table->foreignId('operational_task_id')->nullable()->constrained('operational_tasks')->nullOnDelete();
            $table->foreignId('route_stop_id')->nullable()->constrained('route_stops')->nullOnDelete();
            $table->foreignId('driver_id')->nullable()->constrained('drivers')->nullOnDelete();
            $table->unsignedInteger('attempt_number');
            $table->string('status', 40)->default('started');
            $table->string('result_code', 64)->nullable();
            $table->string('failure_cause_code', 64)->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('arrived_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->string('recipient_name', 120)->nullable();
            $table->string('recipient_document', 60)->nullable();
            $table->string('recipient_relationship', 80)->nullable();
            $table->unsignedBigInteger('cod_expected_amount')->default(0);
            $table->unsignedBigInteger('cod_collected_amount')->default(0);
            $table->string('cod_payment_method', 40)->nullable();
            $table->string('custody_outcome', 48)->nullable();
            $table->text('notes')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();

            $table->unique(['shipment_id', 'attempt_number']);
            $table->index(['driver_id', 'status', 'started_at']);
            $table->index(['shipment_id', 'status']);
        });

        Schema::create('shipment_evidence', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipment_id')->constrained('shipments')->restrictOnDelete();
            $table->foreignId('operational_task_id')->nullable()->constrained('operational_tasks')->nullOnDelete();
            $table->foreignId('delivery_attempt_id')->nullable()->constrained('delivery_attempts')->nullOnDelete();
            $table->string('evidence_type', 48);
            $table->string('original_path', 500);
            $table->string('sealed_path', 500)->nullable();
            $table->string('sha256', 64);
            $table->string('mime_type', 120)->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->string('source', 48)->default('mobile');
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->timestamp('captured_at')->nullable();
            $table->timestamp('received_at');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('metadata_json')->nullable();
            $table->timestamps();

            $table->index(['shipment_id', 'evidence_type']);
            $table->index('sha256');
        });

        Schema::create('custody_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipment_id')->constrained('shipments')->restrictOnDelete();
            $table->foreignId('operational_task_id')->nullable()->constrained('operational_tasks')->nullOnDelete();
            $table->foreignId('shipment_evidence_id')->nullable()->constrained('shipment_evidence')->nullOnDelete();
            $table->string('event_type', 64);
            $table->string('previous_custodian_type', 48)->nullable();
            $table->unsignedBigInteger('previous_custodian_id')->nullable();
            $table->string('previous_custodian_name', 120)->nullable();
            $table->string('new_custodian_type', 48)->nullable();
            $table->unsignedBigInteger('new_custodian_id')->nullable();
            $table->string('new_custodian_name', 120)->nullable();
            $table->string('physical_condition', 48)->nullable();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->timestamp('occurred_at');
            $table->json('metadata_json')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['shipment_id', 'occurred_at']);
            $table->index(['new_custodian_type', 'new_custodian_id']);
            $table->index('event_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('custody_events');
        Schema::dropIfExists('shipment_evidence');
        Schema::dropIfExists('delivery_attempts');
        Schema::dropIfExists('pickup_batch_items');
        Schema::dropIfExists('pickup_batches');
        Schema::dropIfExists('operational_tasks');

        Schema::table('pickup_requests', function (Blueprint $table) {
            $table->dropForeign(['service_location_id']);
            $table->dropIndex(['intake_mode', 'status']);
            $table->dropColumn(['intake_mode', 'service_location_id', 'planned_dropoff_at']);
        });

        Schema::dropIfExists('service_locations');
    }
};
