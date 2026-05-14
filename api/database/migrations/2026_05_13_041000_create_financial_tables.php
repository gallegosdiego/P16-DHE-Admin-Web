<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Gastos fijos (arriendo, internet, etc.) ───
        Schema::create('fixed_expenses', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100); // "Arriendo", "Internet"
            $table->decimal('amount', 12, 0);
            $table->enum('frequency', ['monthly', 'biweekly', 'weekly'])->default('monthly');
            $table->unsignedTinyInteger('due_day')->nullable(); // Día del mes
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ── Pagos de gastos fijos ─────────────────────
        Schema::create('expense_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fixed_expense_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 12, 0);
            $table->date('period_date'); // Mes/periodo al que corresponde
            $table->date('paid_at')->nullable();
            $table->enum('status', ['pending', 'paid', 'overdue'])->default('pending');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['fixed_expense_id', 'period_date']);
            $table->index('status');
        });

        // ── Empleados administrativos ─────────────────
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 100);
            $table->string('position', 60); // "Administrador", "Vendedora", "Despachador"
            $table->string('phone', 24)->nullable();
            $table->decimal('salary', 12, 0);
            $table->enum('pay_frequency', ['monthly', 'biweekly'])->default('monthly');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        // ── Pagos de nómina ───────────────────────────
        Schema::create('payroll_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 12, 0);
            $table->date('period_start');
            $table->date('period_end');
            $table->date('paid_at')->nullable();
            $table->enum('status', ['pending', 'paid'])->default('pending');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'period_start']);
            $table->index('status');
        });

        // ── Pagos a conductores (diario) ──────────────
        Schema::create('driver_payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained()->cascadeOnDelete();
            $table->date('payout_date');
            $table->unsignedInteger('packages_count')->default(0);
            $table->decimal('total_amount', 12, 0)->default(0);
            $table->date('paid_at')->nullable();
            $table->enum('status', ['pending', 'paid'])->default('pending');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['driver_id', 'payout_date']);
            $table->index('status');
        });

        // ── Conciliación contra entrega ───────────────
        Schema::create('cod_settlements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained()->cascadeOnDelete();
            $table->date('settlement_date');
            $table->decimal('total_collected', 12, 0)->default(0); // Total que cobró
            $table->decimal('total_settled', 12, 0)->default(0); // Total que entregó
            $table->decimal('difference', 12, 0)->default(0); // Diferencia
            $table->enum('status', ['pending', 'partial', 'settled'])->default('pending');
            $table->text('notes')->nullable();
            $table->foreignId('settled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['driver_id', 'settlement_date']);
            $table->index('status');
        });

        // ── Log de auditoría ──────────────────────────
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action', 60); // "login", "create_shipment", "settle_cod"
            $table->string('entity_type', 60)->nullable(); // "shipment", "driver", etc.
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->text('description')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->index(['entity_type', 'entity_id']);
            $table->index('action');
            $table->index('occurred_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('cod_settlements');
        Schema::dropIfExists('driver_payouts');
        Schema::dropIfExists('payroll_payments');
        Schema::dropIfExists('employees');
        Schema::dropIfExists('expense_payments');
        Schema::dropIfExists('fixed_expenses');
    }
};
