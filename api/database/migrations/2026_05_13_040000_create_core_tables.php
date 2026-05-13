<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Clientes ──────────────────────────────────
        Schema::create('clients', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('phone', 24)->nullable();
            $table->string('email', 120)->nullable();
            $table->string('company', 100)->nullable();
            $table->string('nit', 20)->nullable();
            $table->enum('billing_type', ['cash_on_delivery', 'post_sale', 'prepaid'])->default('cash_on_delivery');
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->index('phone');
            $table->index('billing_type');
        });

        // ── Direcciones de clientes ───────────────────
        Schema::create('client_addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->string('label', 60)->nullable(); // "Casa", "Oficina", etc.
            $table->string('address', 200);
            $table->string('zone', 60)->nullable();
            $table->string('city', 60)->default('Bogotá');
            $table->text('instructions')->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();

            $table->index('zone');
        });

        // ── Conductores ───────────────────────────────
        Schema::create('drivers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 100);
            $table->string('initials', 3)->nullable();
            $table->string('phone', 24);
            $table->string('vehicle', 80)->default('Moto');
            $table->string('plate', 16)->nullable();
            $table->string('zone', 60)->nullable();
            $table->enum('status', ['active', 'route', 'inactive'])->default('active');
            $table->unsignedTinyInteger('efficiency')->default(90);
            $table->decimal('daily_rate', 12, 0)->default(0); // Pago por día
            $table->decimal('per_package_rate', 12, 0)->default(3000); // Pago por paquete
            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
            $table->index('zone');
        });

        // ── Envíos (shipments) ────────────────────────
        Schema::create('shipments', function (Blueprint $table) {
            $table->id();

            // Guía interna: DHE + YYYYMMDD + NNNNN
            $table->string('tracking_code', 20)->unique();
            // Código visible: #DHE00042
            $table->string('display_code', 16)->unique();
            // Consecutivo global
            $table->unsignedBigInteger('sequence_number')->unique();

            // Relaciones
            $table->foreignId('client_id')->constrained()->restrictOnDelete();
            $table->foreignId('driver_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();

            // Receptor (puede ser diferente al cliente)
            $table->string('recipient_name', 100);
            $table->string('recipient_phone', 24);
            $table->string('recipient_address', 200);
            $table->string('recipient_zone', 60)->nullable();
            $table->string('recipient_city', 60)->default('Bogotá');
            $table->text('delivery_instructions')->nullable();

            // Estado
            $table->string('status', 30)->default('registered');

            // Financiero (nace desde Entrega 2 — ajuste del colaborador)
            $table->enum('payment_type', ['cash_on_delivery', 'post_sale', 'prepaid'])->default('cash_on_delivery');
            $table->decimal('shipping_cost', 12, 0)->default(0); // Lo que cobra Danhei
            $table->decimal('cod_amount', 12, 0)->default(0); // Monto contra entrega
            $table->string('financial_status', 20)->default('pending'); // pending, collected, invoiced, settled, overdue
            $table->boolean('driver_paid')->default(false); // ¿Se le pagó al conductor?
            $table->decimal('driver_fee', 12, 0)->default(0); // Lo que se le paga al conductor

            // Tercerización
            $table->boolean('is_outsourced')->default(false);
            $table->string('outsource_company', 100)->nullable();
            $table->decimal('outsource_amount', 12, 0)->default(0); // Lo que la empresa paga a Danhei

            // Evidencia
            $table->text('notes')->nullable();
            $table->text('issue_note')->nullable();
            $table->string('evidence_photo')->nullable();
            $table->string('evidence_signature')->nullable();
            $table->string('evidence_receiver_name', 100)->nullable();

            // Timestamps
            $table->timestamp('picked_up_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            // Índices
            $table->index('status');
            $table->index('payment_type');
            $table->index('financial_status');
            $table->index('driver_paid');
            $table->index('is_outsourced');
            $table->index('created_at');
        });

        // ── Eventos de tracking (timeline auditable) ──
        Schema::create('shipment_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('from_status', 30)->nullable();
            $table->string('to_status', 30);
            $table->text('description')->nullable();
            $table->json('metadata')->nullable(); // GPS, evidencia, etc.
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->index(['shipment_id', 'occurred_at']);
        });

        // ── Rutas diarias ─────────────────────────────
        Schema::create('routes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained()->cascadeOnDelete();
            $table->date('route_date');
            $table->string('zone', 60)->nullable();
            $table->enum('status', ['planned', 'active', 'completed'])->default('planned');
            $table->unsignedInteger('total_stops')->default(0);
            $table->unsignedInteger('completed_stops')->default(0);
            $table->timestamps();

            $table->unique(['driver_id', 'route_date']);
            $table->index('route_date');
        });

        // ── Paradas de ruta ───────────────────────────
        Schema::create('route_stops', function (Blueprint $table) {
            $table->id();
            $table->foreignId('route_id')->constrained()->cascadeOnDelete();
            $table->foreignId('shipment_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->enum('status', ['pending', 'completed', 'skipped'])->default('pending');
            $table->timestamps();

            $table->index(['route_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('route_stops');
        Schema::dropIfExists('routes');
        Schema::dropIfExists('shipment_events');
        Schema::dropIfExists('shipments');
        Schema::dropIfExists('drivers');
        Schema::dropIfExists('client_addresses');
        Schema::dropIfExists('clients');
    }
};
