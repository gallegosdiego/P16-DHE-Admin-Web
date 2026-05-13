<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class RolesAndPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        // Reset cached roles and permissions
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        // ── Permisos ──────────────────────────────────────
        $permissions = [
            // Envíos
            'shipments.view',
            'shipments.create',
            'shipments.edit',
            'shipments.delete',
            'shipments.assign',
            'shipments.change_status',

            // Conductores
            'drivers.view',
            'drivers.create',
            'drivers.edit',
            'drivers.toggle_status',

            // Clientes
            'clients.view',
            'clients.create',
            'clients.edit',

            // Financiero
            'financial.view',
            'financial.collect',
            'financial.settle',
            'financial.expenses',
            'financial.payroll',

            // Reportes
            'reports.view',
            'reports.export',

            // Configuración
            'settings.view',
            'settings.edit',

            // Usuarios
            'users.view',
            'users.create',
            'users.edit',
            'users.delete',
        ];

        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        // ── Roles ─────────────────────────────────────────

        // Superadmin — acceso total (no se le asignan permisos, usa Gate::before)
        $superadmin = Role::firstOrCreate(['name' => 'superadmin', 'guard_name' => 'web']);

        // Administrador — gestión operativa completa
        $admin = Role::firstOrCreate(['name' => 'administrador', 'guard_name' => 'web']);
        $admin->syncPermissions($permissions);

        // Operador — gestión de envíos y conductores, sin financiero
        $operador = Role::firstOrCreate(['name' => 'operador', 'guard_name' => 'web']);
        $operador->syncPermissions([
            'shipments.view', 'shipments.create', 'shipments.edit',
            'shipments.assign', 'shipments.change_status',
            'drivers.view',
            'clients.view', 'clients.create',
        ]);

        // Conductor — solo ve sus propios envíos (permisos manejados por policy)
        Role::firstOrCreate(['name' => 'conductor', 'guard_name' => 'web']);

        // Cliente — solo ve sus propios envíos (permisos manejados por policy)
        Role::firstOrCreate(['name' => 'cliente', 'guard_name' => 'web']);
        // ── Usuarios demo ─────────────────────────────────

        // Superadmin
        $user = User::firstOrCreate(
            ['email' => 'admin@danheiexpress.com'],
            [
                'name' => 'Ángel Danhei',
                'password' => Hash::make('DanheiAdmin2026!'),
                'phone' => '300 000 0000',
            ]
        );
        $user->assignRole($superadmin);

        // Administrador
        $user2 = User::firstOrCreate(
            ['email' => 'sandra@danheiexpress.com'],
            [
                'name' => 'Sandra López',
                'password' => Hash::make('Danhei2026!'),
                'phone' => '310 555 1234',
            ]
        );
        $user2->assignRole($admin);

        // Operador
        $user3 = User::firstOrCreate(
            ['email' => 'operador@danheiexpress.com'],
            [
                'name' => 'Carlos Despacho',
                'password' => Hash::make('Danhei2026!'),
                'phone' => '312 666 7890',
            ]
        );
        $user3->assignRole($operador);

        $this->command->info('✅ Roles, permisos y 3 usuarios demo creados.');
    }
}
