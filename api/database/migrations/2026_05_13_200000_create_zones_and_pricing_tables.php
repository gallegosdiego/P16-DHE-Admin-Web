<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Zonas de cobertura ────────────────────────
        Schema::create('zones', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80);           // "Chapinero", "Soacha", etc.
            $table->string('slug', 80)->unique();  // "chapinero", "soacha"
            $table->string('city', 60)->default('Bogotá');
            $table->string('type', 20)->default('urban'); // urban, suburban, extended
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->text('description')->nullable();
            // Polígono simplificado: lat/lng bounds (para uso sin PostGIS)
            $table->decimal('lat_min', 10, 7)->nullable();
            $table->decimal('lat_max', 10, 7)->nullable();
            $table->decimal('lng_min', 10, 7)->nullable();
            $table->decimal('lng_max', 10, 7)->nullable();
            $table->timestamps();
        });

        // ── Reglas de tarifas ─────────────────────────
        Schema::create('pricing_rules', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);           // "Tarifa base Bogotá", "Recargo Soacha"
            $table->foreignId('zone_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 30)->default('flat'); // flat, per_kg, per_km, surge
            $table->decimal('base_price', 12, 0)->default(0);    // Precio base en COP
            $table->decimal('per_kg_price', 12, 0)->default(0);  // Adicional por kg
            $table->decimal('per_km_price', 12, 0)->default(0);  // Adicional por km
            $table->decimal('min_price', 12, 0)->default(10000); // Precio mínimo
            $table->decimal('max_weight_kg', 8, 2)->default(50); // Peso máximo
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('priority')->default(0); // Mayor prioridad = se aplica primero
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('zone_id');
            $table->index('type');
            $table->index('is_active');
        });

        // ── Notificaciones internas ───────────────────
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 40);            // shipment_status, financial, system
            $table->string('title', 200);
            $table->text('body')->nullable();
            $table->string('action_url')->nullable(); // "/pedidos?id=15"
            $table->json('metadata')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'read_at']);
            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('pricing_rules');
        Schema::dropIfExists('zones');
    }
};
