<?php

namespace Database\Seeders;

use App\Domain\Shared\Models\PricingRule;
use App\Domain\Shared\Models\Zone;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class ProductionSeeder extends Seeder
{
    public function run(): void
    {
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        $permissions = [
            'dashboard.view',
            'shipments.view', 'shipments.create', 'shipments.edit', 'shipments.delete', 'shipments.assign', 'shipments.change_status',
            'routes.view', 'routes.manage',
            'drivers.view', 'drivers.create', 'drivers.edit', 'drivers.toggle_status', 'drivers.delete',
            'clients.view', 'clients.create', 'clients.edit',
            'financial.view', 'financial.collect', 'financial.settle', 'financial.expenses', 'financial.payroll',
            'reports.view', 'reports.export',
            'settings.view', 'settings.edit',
            'users.view', 'users.create', 'users.edit', 'users.delete',
        ];

        foreach (['web', 'sanctum'] as $guard) {
            foreach ($permissions as $permission) {
                Permission::firstOrCreate(['name' => $permission, 'guard_name' => $guard]);
            }
        }

        $superadminRole = Role::firstOrCreate(['name' => 'superadmin', 'guard_name' => 'web']);
        $adminRole = Role::firstOrCreate(['name' => 'administrador', 'guard_name' => 'web']);
        $operadorRole = Role::firstOrCreate(['name' => 'operador', 'guard_name' => 'web']);
        $legacyDriverRole = Role::firstOrCreate(['name' => 'conductor', 'guard_name' => 'web']);
        $legacyClientRole = Role::firstOrCreate(['name' => 'cliente', 'guard_name' => 'web']);

        $superadminRole->syncPermissions($permissions);
        $adminRole->syncPermissions($permissions);
        $operadorRole->syncPermissions([
            'dashboard.view',
            'shipments.view', 'shipments.create', 'shipments.edit',
            'shipments.assign', 'shipments.change_status',
            'drivers.view',
            'clients.view', 'clients.create',
            'routes.view',
        ]);

        $clientPerms = ['shipments.view', 'shipments.create', 'clients.view', 'clients.edit'];
        $driverPerms = ['routes.view', 'routes.manage', 'shipments.view', 'shipments.change_status', 'financial.collect'];

        $clientRole = Role::firstOrCreate(['name' => 'client', 'guard_name' => 'web']);
        $clientRole->syncPermissions($clientPerms);
        $legacyClientRole->syncPermissions($clientPerms);

        $driverRole = Role::firstOrCreate(['name' => 'driver', 'guard_name' => 'web']);
        $driverRole->syncPermissions($driverPerms);
        $legacyDriverRole->syncPermissions($driverPerms);

        // Sanctum guard — necesario para API endpoints
        $superadminSanctum = Role::firstOrCreate(['name' => 'superadmin', 'guard_name' => 'sanctum']);
        $adminSanctum = Role::firstOrCreate(['name' => 'administrador', 'guard_name' => 'sanctum']);
        $operadorSanctum = Role::firstOrCreate(['name' => 'operador', 'guard_name' => 'sanctum']);
        $legacyDriverSanctum = Role::firstOrCreate(['name' => 'conductor', 'guard_name' => 'sanctum']);
        $legacyClientSanctum = Role::firstOrCreate(['name' => 'cliente', 'guard_name' => 'sanctum']);
        $clientRoleSanctum = Role::firstOrCreate(['name' => 'client', 'guard_name' => 'sanctum']);
        $driverRoleSanctum = Role::firstOrCreate(['name' => 'driver', 'guard_name' => 'sanctum']);

        $superadminSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $permissions)->get());
        $adminSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $permissions)->get());
        $operadorSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', [
            'dashboard.view',
            'shipments.view', 'shipments.create', 'shipments.edit',
            'shipments.assign', 'shipments.change_status',
            'drivers.view',
            'clients.view', 'clients.create',
            'routes.view',
        ])->get());
        $clientRoleSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $clientPerms)->get());
        $driverRoleSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $driverPerms)->get());
        $legacyClientSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $clientPerms)->get());
        $legacyDriverSanctum->syncPermissions(Permission::query()->where('guard_name', 'sanctum')->whereIn('name', $driverPerms)->get());

        $masterEmail = (string) env('MASTER_EMAIL', 'admin@danheiexpress.com');
        $masterName = (string) env('MASTER_NAME', 'Danhei Superadmin');
        $masterPassword = (string) env('MASTER_PASSWORD', '');

        if ($masterPassword === '') {
            $this->command?->warn('MASTER_PASSWORD no configurado. Se omite creación de superadmin.');
            return;
        }

        $superadmin = User::updateOrCreate(
            ['email' => $masterEmail],
            [
                'name' => $masterName,
                'password' => Hash::make($masterPassword),
                'phone' => null,
            ]
        );

        if (! $superadmin->hasRole($superadminRole->name)) {
            $superadmin->assignRole($superadminRole->name);
        }
        // Also assign sanctum guard role for API access
        if (! $superadmin->hasRole('superadmin', 'sanctum')) {
            $superadmin->assignRole($superadminSanctum);
        }

        $zones = [
            ['name' => 'Bogota Centro', 'city' => 'Bogota', 'type' => 'urban', 'sort_order' => 1, 'description' => 'Centro y centro-norte'],
            ['name' => 'Chapinero', 'city' => 'Bogota', 'type' => 'urban', 'sort_order' => 2, 'description' => 'Zona G y Zona T'],
            ['name' => 'Usaquen', 'city' => 'Bogota', 'type' => 'urban', 'sort_order' => 3, 'description' => 'Norte de Bogota'],
            ['name' => 'Kennedy', 'city' => 'Bogota', 'type' => 'urban', 'sort_order' => 4, 'description' => 'Suroccidente de Bogota'],
            ['name' => 'Soacha', 'city' => 'Soacha', 'type' => 'suburban', 'sort_order' => 5, 'description' => 'Cobertura municipal'],
            ['name' => 'Chia', 'city' => 'Chia', 'type' => 'suburban', 'sort_order' => 6, 'description' => 'Cobertura norte'],
            ['name' => 'Mosquera', 'city' => 'Mosquera', 'type' => 'suburban', 'sort_order' => 7, 'description' => 'Cobertura occidente'],
            ['name' => 'Zipaquira', 'city' => 'Zipaquira', 'type' => 'extended', 'sort_order' => 8, 'description' => 'Cobertura extendida'],
            ['name' => 'Ruta al Llano', 'city' => 'Villavicencio', 'type' => 'extended', 'sort_order' => 9, 'description' => 'Cobertura extendida', 'is_active' => false],
        ];

        foreach ($zones as $item) {
            $zone = Zone::updateOrCreate(
                ['slug' => Str::slug($item['name'])],
                [
                    'name' => $item['name'],
                    'city' => $item['city'],
                    'type' => $item['type'],
                    'is_active' => $item['is_active'] ?? true,
                    'sort_order' => $item['sort_order'],
                    'description' => $item['description'],
                ]
            );

            PricingRule::updateOrCreate(
                ['zone_id' => $zone->id, 'name' => "Tarifa {$zone->name}"],
                [
                    'type' => 'flat',
                    'base_price' => match ($zone->type) {
                        'urban' => 10000,
                        'suburban' => 15000,
                        default => 18000,
                    },
                    'per_kg_price' => $zone->type === 'extended' ? 1500 : 0,
                    'per_km_price' => 0,
                    'min_price' => match ($zone->type) {
                        'urban' => 10000,
                        'suburban' => 15000,
                        default => 18000,
                    },
                    'is_active' => true,
                    'priority' => 0,
                ]
            );
        }
    }
}
