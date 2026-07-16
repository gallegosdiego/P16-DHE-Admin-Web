<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('financial_rate_rules', function (Blueprint $table) {
            $table->id();
            $table->uuid('rule_key');
            $table->unsignedSmallInteger('version')->default(1);
            $table->foreignId('supersedes_rule_id')->nullable()->constrained('financial_rate_rules')->nullOnDelete();
            $table->string('name', 120);
            $table->string('service_type', 48);
            $table->string('scope_type', 24)->default('global');
            $table->foreignId('driver_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->foreignId('zone_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('amount');
            $table->char('currency', 3)->default('COP');
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->unsignedSmallInteger('priority')->default(0);
            $table->boolean('is_active')->default(true);
            $table->text('change_reason');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();

            $table->unique(['rule_key', 'version']);
            $table->index(['service_type', 'is_active', 'effective_from', 'effective_to']);
            $table->index(['scope_type', 'driver_id', 'client_id', 'zone_id']);
        });

        Schema::table('driver_service_earnings', function (Blueprint $table) {
            $table->foreignId('rate_rule_id')
                ->nullable()
                ->after('operational_task_id')
                ->constrained('financial_rate_rules')
                ->nullOnDelete();
            $table->unsignedBigInteger('standard_amount')->default(0)->after('amount');
            $table->json('rate_snapshot_json')->nullable()->after('standard_amount');
            $table->unique(['operational_task_id', 'service_type'], 'driver_earning_task_service_unique');
        });

        $this->registerPermission();
    }

    public function down(): void
    {
        $permissionIds = DB::table('permissions')
            ->where('name', 'financial.rates')
            ->pluck('id');
        DB::table('role_has_permissions')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('id', $permissionIds)->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Schema::table('driver_service_earnings', function (Blueprint $table) {
            $table->dropUnique('driver_earning_task_service_unique');
            $table->dropForeign(['rate_rule_id']);
            $table->dropColumn(['rate_rule_id', 'standard_amount', 'rate_snapshot_json']);
        });

        Schema::dropIfExists('financial_rate_rules');
    }

    private function registerPermission(): void
    {
        DB::transaction(function () {
            foreach (['web', 'sanctum'] as $guard) {
                $permissionId = DB::table('permissions')
                    ->where('name', 'financial.rates')
                    ->where('guard_name', $guard)
                    ->value('id');

                if ($permissionId === null) {
                    $permissionId = DB::table('permissions')->insertGetId([
                        'name' => 'financial.rates',
                        'guard_name' => $guard,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }

                $roleIds = DB::table('roles')
                    ->where('guard_name', $guard)
                    ->whereIn('name', ['superadmin', 'administrador'])
                    ->pluck('id');

                foreach ($roleIds as $roleId) {
                    DB::table('role_has_permissions')->updateOrInsert([
                        'permission_id' => $permissionId,
                        'role_id' => $roleId,
                    ]);
                }
            }
        });

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
