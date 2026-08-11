<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Roles del ecosistema Danhei. Cinco, ni uno más.
 *
 * | Rol             | Quién es                                        | Alcance |
 * |-----------------|-------------------------------------------------|---------|
 * | `superadmin`    | Desarrollo. Administra la propia aplicación.    | Todo, sin excepción. Único que puede cambiar credenciales de integración. |
 * | `administrador` | La dueña o dueño del negocio.                   | Toda la operación y las finanzas. |
 * | `operador`      | Empleado de mostrador que recibe los paquetes.  | Ingreso, envíos, rutas y consulta de clientes y pilotos. Sin finanzas ni usuarios. |
 * | `driver`        | El piloto. En pantalla: «Conductor / Piloto».   | Su ruta, sus envíos y el recaudo de sus entregas. |
 * | `client`        | El cliente corporativo, en su propio portal.    | Sus envíos y sus recogidas. Nada ajeno. |
 *
 * **Nombre interno en inglés, etiqueta en español.** `driver` se muestra como
 * «Conductor / Piloto» y `client` como «Cliente». El nombre interno no se
 * traduce: renombrarlo obligaría a migrar cada usuario y cada comprobación del
 * código a cambio de nada.
 *
 * Hasta agosto de 2026 existían además `conductor` y `cliente`, duplicados en
 * español creados «por retrocompatibilidad». Llegaron a producción con 0
 * usuarios y aparecían en el desplegable como «(legacy)», invitando a repartir
 * pilotos entre dos roles equivalentes. Los retira la migración
 * `2026_08_11_200000_remove_duplicate_legacy_roles`. **No volver a crearlos.**
 *
 * Cada rol se registra en los dos guards, `web` y `sanctum`, porque el panel
 * autentica por Sanctum y Spatie resuelve los permisos por guard.
 *
 * Detalle completo en `docs/ROLES.md`.
 */
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
            'clients.delete',
            'financial.view',
            'financial.collect',
            'financial.settle',
            'financial.expenses',
            'financial.payroll',
            'financial.rates',
            'financial.reverse',
            'financial.opening',
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
        $clientWeb = Role::firstOrCreate(['name' => 'client', 'guard_name' => 'web']);
        $driverWeb = Role::firstOrCreate(['name' => 'driver', 'guard_name' => 'web']);

        $superadminWeb->syncPermissions($adminPerms);
        $adminWeb->syncPermissions($adminPerms);
        $operadorWeb->syncPermissions($operadorPerms);
        $clientWeb->syncPermissions($clientPerms);
        $driverWeb->syncPermissions($driverPerms);


        $superadminSanctum = Role::firstOrCreate(['name' => 'superadmin', 'guard_name' => 'sanctum']);
        $adminSanctum = Role::firstOrCreate(['name' => 'administrador', 'guard_name' => 'sanctum']);
        $operadorSanctum = Role::firstOrCreate(['name' => 'operador', 'guard_name' => 'sanctum']);
        $clientSanctum = Role::firstOrCreate(['name' => 'client', 'guard_name' => 'sanctum']);
        $driverSanctum = Role::firstOrCreate(['name' => 'driver', 'guard_name' => 'sanctum']);

        $superadminSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $adminPerms)->get());
        $adminSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $adminPerms)->get());
        $operadorSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $operadorPerms)->get());
        $clientSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $clientPerms)->get());
        $driverSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $driverPerms)->get());


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
