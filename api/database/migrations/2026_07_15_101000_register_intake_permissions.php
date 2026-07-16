<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    /** @var list<string> */
    private array $permissions = [
        'shipments.direct_create',
        'intakes.create',
        'intakes.add_package',
        'intakes.assign',
        'intakes.receive',
        'intakes.materialize',
    ];

    public function up(): void
    {
        DB::transaction(function () {
            foreach (['web', 'sanctum'] as $guard) {
                foreach ($this->permissions as $name) {
                    $permissionId = DB::table('permissions')
                        ->where('name', $name)
                        ->where('guard_name', $guard)
                        ->value('id');
                    if ($permissionId === null) {
                        $permissionId = DB::table('permissions')->insertGetId([
                            'name' => $name,
                            'guard_name' => $guard,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    }

                    $roleNames = match ($name) {
                        'shipments.direct_create' => ['superadmin', 'administrador'],
                        'intakes.create', 'intakes.add_package' => ['superadmin', 'administrador', 'operador', 'client', 'cliente'],
                        default => ['superadmin', 'administrador', 'operador'],
                    };
                    $roleIds = DB::table('roles')
                        ->where('guard_name', $guard)
                        ->whereIn('name', $roleNames)
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

    public function down(): void
    {
        DB::transaction(function () {
            $permissionIds = DB::table('permissions')
                ->whereIn('name', $this->permissions)
                ->pluck('id');
            DB::table('role_has_permissions')->whereIn('permission_id', $permissionIds)->delete();
            DB::table('permissions')->whereIn('id', $permissionIds)->delete();
        });

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
