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
        Schema::create('financial_opening_entries', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 48)->unique();
            $table->string('account_type', 48);
            $table->foreignId('driver_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('client_id')->nullable()->constrained('clients')->restrictOnDelete();
            $table->unsignedBigInteger('amount');
            $table->date('effective_date');
            $table->string('support_reference', 191);
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at');
            $table->timestamps();

            $table->index(['account_type', 'effective_date']);
            $table->index(['driver_id', 'client_id']);
        });

        $this->makeShipmentNullable('driver_cod_obligations');
        $this->makeShipmentNullable('client_cod_entitlements');

        Schema::table('driver_cod_obligations', function (Blueprint $table) {
            $table->foreignId('opening_entry_id')
                ->nullable()
                ->after('delivery_attempt_id')
                ->constrained('financial_opening_entries')
                ->restrictOnDelete();
        });
        Schema::table('driver_service_earnings', function (Blueprint $table) {
            $table->foreignId('opening_entry_id')
                ->nullable()
                ->after('operational_task_id')
                ->constrained('financial_opening_entries')
                ->restrictOnDelete();
        });
        Schema::table('client_cod_entitlements', function (Blueprint $table) {
            $table->foreignId('opening_entry_id')
                ->nullable()
                ->after('driver_cod_obligation_id')
                ->constrained('financial_opening_entries')
                ->restrictOnDelete();
        });

        $this->addMovementControls('driver_cod_remittances', 'received_by', 'received_at');
        $this->addMovementControls('driver_service_payments', 'paid_by', 'paid_at', addStatus: true);
        $this->addMovementControls('client_cod_payouts', 'paid_by', 'paid_at', addStatus: true);

        $this->registerPermissions();
    }

    public function down(): void
    {
        $this->dropPermissions();

        $this->dropMovementControls('client_cod_payouts', dropStatus: true);
        $this->dropMovementControls('driver_service_payments', dropStatus: true);
        $this->dropMovementControls('driver_cod_remittances');

        DB::table('driver_cod_obligations')->whereNotNull('opening_entry_id')->delete();
        DB::table('driver_service_earnings')->whereNotNull('opening_entry_id')->delete();
        DB::table('client_cod_entitlements')->whereNotNull('opening_entry_id')->delete();

        Schema::table('client_cod_entitlements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('opening_entry_id');
        });
        Schema::table('driver_service_earnings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('opening_entry_id');
        });
        Schema::table('driver_cod_obligations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('opening_entry_id');
        });

        $this->makeShipmentRequired('client_cod_entitlements');
        $this->makeShipmentRequired('driver_cod_obligations');
        Schema::dropIfExists('financial_opening_entries');
    }

    private function addMovementControls(string $tableName, string $actorColumn, string $dateColumn, bool $addStatus = false): void
    {
        Schema::table($tableName, function (Blueprint $table) use ($tableName, $actorColumn, $dateColumn, $addStatus) {
            $table->unsignedBigInteger('balance_before')->default(0)->after('allocated_amount');
            $table->unsignedBigInteger('balance_after')->default(0)->after('balance_before');
            $table->string('movement_type', 24)->default('standard')->after('balance_after');
            if ($addStatus) {
                $table->string('status', 32)->default('posted')->after('movement_type');
            }
            $table->foreignId('reversal_of_id')
                ->nullable()
                ->after('status')
                ->constrained($tableName)
                ->restrictOnDelete();
            $table->unique('reversal_of_id');
            $table->foreignId('approved_by')
                ->nullable()
                ->after($actorColumn)
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after($dateColumn);
        });
    }

    private function dropMovementControls(string $tableName, bool $dropStatus = false): void
    {
        Schema::table($tableName, function (Blueprint $table) use ($dropStatus) {
            $table->dropUnique(['reversal_of_id']);
            $table->dropForeign(['reversal_of_id']);
            $table->dropForeign(['approved_by']);
            $columns = [
                'balance_before',
                'balance_after',
                'movement_type',
                'reversal_of_id',
                'approved_by',
                'approved_at',
            ];
            if ($dropStatus) {
                $columns[] = 'status';
            }
            $table->dropColumn($columns);
        });
    }

    private function makeShipmentNullable(string $tableName): void
    {
        Schema::table($tableName, function (Blueprint $table) {
            $table->dropForeign(['shipment_id']);
        });
        Schema::table($tableName, function (Blueprint $table) {
            $table->unsignedBigInteger('shipment_id')->nullable()->change();
            $table->foreign('shipment_id')->references('id')->on('shipments')->restrictOnDelete();
        });
    }

    private function makeShipmentRequired(string $tableName): void
    {
        Schema::table($tableName, function (Blueprint $table) {
            $table->dropForeign(['shipment_id']);
        });
        Schema::table($tableName, function (Blueprint $table) {
            $table->unsignedBigInteger('shipment_id')->nullable(false)->change();
            $table->foreign('shipment_id')->references('id')->on('shipments')->restrictOnDelete();
        });
    }

    private function registerPermissions(): void
    {
        DB::transaction(function () {
            foreach (['web', 'sanctum'] as $guard) {
                foreach (['financial.reverse', 'financial.opening'] as $permissionName) {
                    $permissionId = DB::table('permissions')
                        ->where('name', $permissionName)
                        ->where('guard_name', $guard)
                        ->value('id');

                    if ($permissionId === null) {
                        $permissionId = DB::table('permissions')->insertGetId([
                            'name' => $permissionName,
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
            }
        });

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    private function dropPermissions(): void
    {
        $permissionIds = DB::table('permissions')
            ->whereIn('name', ['financial.reverse', 'financial.opening'])
            ->pluck('id');
        DB::table('role_has_permissions')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('id', $permissionIds)->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
