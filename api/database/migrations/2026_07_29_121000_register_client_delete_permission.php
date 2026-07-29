<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    private string $permission = 'clients.delete';

    public function up(): void
    {
        DB::transaction(function (): void {
            foreach (['web', 'sanctum'] as $guard) {
                $permissionId = DB::table('permissions')
                    ->where('name', $this->permission)
                    ->where('guard_name', $guard)
                    ->value('id');

                if ($permissionId === null) {
                    $permissionId = DB::table('permissions')->insertGetId([
                        'name' => $this->permission,
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

    public function down(): void
    {
        DB::transaction(function (): void {
            $permissionIds = DB::table('permissions')
                ->where('name', $this->permission)
                ->pluck('id');

            DB::table('role_has_permissions')->whereIn('permission_id', $permissionIds)->delete();
            DB::table('permissions')->whereIn('id', $permissionIds)->delete();
        });

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
