<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolesAndPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        $permissions = [
            'dashboard.view',
            'shipments.view',
            'shipments.create',
            'shipments.edit',
            'shipments.delete',
            'shipments.assign',
            'shipments.change_status',
            'shipments.direct_create',
            'intakes.create',
            'intakes.add_package',
            'intakes.assign',
            'intakes.receive',
            'intakes.materialize',
            'routes.view',
            'routes.manage',
            'drivers.view',
            'drivers.create',
            'drivers.edit',
            'drivers.toggle_status',
            'drivers.delete',
            'clients.view',
            'clients.create',
            'clients.edit',
            'financial.view',
            'financial.collect',
            'financial.settle',
            'financial.expenses',
            'financial.payroll',
            'reports.view',
            'reports.export',
            'settings.view',
            'settings.edit',
            'users.view',
            'users.create',
            'users.edit',
            'users.delete',
        ];

        foreach (['web', 'sanctum'] as $guard) {
            foreach ($permissions as $permission) {
                Permission::firstOrCreate(['name' => $permission, 'guard_name' => $guard]);
            }
        }

        $adminPerms = $permissions;
        $operadorPerms = [
            'dashboard.view',
            'shipments.view', 'shipments.create', 'shipments.edit',
            'shipments.assign', 'shipments.change_status',
            'intakes.create', 'intakes.add_package', 'intakes.assign',
            'intakes.receive', 'intakes.materialize',
            'drivers.view',
            'clients.view', 'clients.create',
            'routes.view',
        ];
        $clientPerms = [
            'shipments.view',
            'shipments.create',
            'intakes.create',
            'intakes.add_package',
            'clients.view',
            'clients.edit',
        ];
        $driverPerms = [
            'routes.view',
            'routes.manage',
            'shipments.view',
            'shipments.change_status',
            'financial.collect',
        ];

        $superadminWeb = Role::firstOrCreate(['name' => 'superadmin', 'guard_name' => 'web']);
        $adminWeb = Role::firstOrCreate(['name' => 'administrador', 'guard_name' => 'web']);
        $operadorWeb = Role::firstOrCreate(['name' => 'operador', 'guard_name' => 'web']);
        $conductorWeb = Role::firstOrCreate(['name' => 'conductor', 'guard_name' => 'web']);
        $clienteWeb = Role::firstOrCreate(['name' => 'cliente', 'guard_name' => 'web']);
        $clientWeb = Role::firstOrCreate(['name' => 'client', 'guard_name' => 'web']);
        $driverWeb = Role::firstOrCreate(['name' => 'driver', 'guard_name' => 'web']);

        $superadminWeb->syncPermissions($adminPerms);
        $adminWeb->syncPermissions($adminPerms);
        $operadorWeb->syncPermissions($operadorPerms);
        $clientWeb->syncPermissions($clientPerms);
        $driverWeb->syncPermissions($driverPerms);

        // Retrocompatibilidad: sincronizar permisos en roles español
        $conductorWeb->syncPermissions($driverPerms);
        $clienteWeb->syncPermissions($clientPerms);

        $superadminSanctum = Role::firstOrCreate(['name' => 'superadmin', 'guard_name' => 'sanctum']);
        $adminSanctum = Role::firstOrCreate(['name' => 'administrador', 'guard_name' => 'sanctum']);
        $operadorSanctum = Role::firstOrCreate(['name' => 'operador', 'guard_name' => 'sanctum']);
        $conductorSanctum = Role::firstOrCreate(['name' => 'conductor', 'guard_name' => 'sanctum']);
        $clienteSanctum = Role::firstOrCreate(['name' => 'cliente', 'guard_name' => 'sanctum']);
        $clientSanctum = Role::firstOrCreate(['name' => 'client', 'guard_name' => 'sanctum']);
        $driverSanctum = Role::firstOrCreate(['name' => 'driver', 'guard_name' => 'sanctum']);

        $superadminSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $adminPerms)->get());
        $adminSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $adminPerms)->get());
        $operadorSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $operadorPerms)->get());
        $clientSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $clientPerms)->get());
        $driverSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $driverPerms)->get());

        // Retrocompatibilidad: sincronizar permisos en roles español
        $conductorSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $driverPerms)->get());
        $clienteSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $clientPerms)->get());

        // ── Usuarios demo (solo en entornos no-producción) ──
        if (app()->environment('local', 'testing', 'staging')) {
            $user = User::firstOrCreate(
                ['email' => 'admin@danheiexpress.com'],
                [
                    'name' => 'Angel Danhei',
                    'password' => Hash::make('DanheiAdmin2026!'),
                    'phone' => '300 000 0000',
                ]
            );
            $user->syncRoles([$superadminWeb, $superadminSanctum]);

            $user2 = User::firstOrCreate(
                ['email' => 'sandra@danheiexpress.com'],
                [
                    'name' => 'Sandra Lopez',
                    'password' => Hash::make('Danhei2026!'),
                    'phone' => '310 555 1234',
                ]
            );
            $user2->syncRoles([$adminWeb, $adminSanctum]);

            $user3 = User::firstOrCreate(
                ['email' => 'operador@danheiexpress.com'],
                [
                    'name' => 'Carlos Despacho',
                    'password' => Hash::make('Danhei2026!'),
                    'phone' => '312 666 7890',
                ]
            );
            $user3->syncRoles([$operadorWeb, $operadorSanctum]);

            $this->command->info('Roles, permisos y usuarios demo creados.');
        } else {
            $this->command->info('Roles y permisos sincronizados (usuarios demo omitidos en producción).');
        }
    }
}
