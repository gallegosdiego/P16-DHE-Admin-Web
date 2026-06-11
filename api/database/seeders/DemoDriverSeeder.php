<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Seeder DEMO para la App Repartidor (P15).
 * 
 * Crea un usuario piloto con rol conductor, vinculado a un driver,
 * con una ruta completa para HOY con 8 paradas en diferentes estados.
 *
 * Ejecutar: php artisan db:seed --class=DemoDriverSeeder
 */
class DemoDriverSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();
        $today = $now->toDateString();

        // ─── 1. Crear/actualizar driver piloto ───
        $driverId = DB::table('drivers')->updateOrInsert(
            ['phone' => '311 220 6587'],
            [
                'user_id'          => null,
                'name'             => 'Piloto Demo',
                'initials'         => 'PD',
                'phone'            => '311 220 6587',
                'vehicle'          => 'Moto Yamaha FZ 250',
                'plate'            => 'ABC-123',
                'zone'             => 'Chapinero',
                'status'           => 'route',
                'efficiency'       => 92,
                'daily_rate'       => 40000,
                'per_package_rate' => 3500,
                'created_at'       => $now,
                'updated_at'       => $now,
            ]
        );
        $driver = DB::table('drivers')->where('phone', '311 220 6587')->first();
        $driverId = $driver->id;

        // ─── 2. Crear/actualizar user piloto ───
        $existingUser = DB::table('users')->where('email', 'piloto@danheiexpress.com')->first();
        
        if ($existingUser) {
            DB::table('users')->where('id', $existingUser->id)->update([
                'driver_id'  => $driverId,
                'updated_at' => $now,
            ]);
            $userId = $existingUser->id;
        } else {
            $userId = DB::table('users')->insertGetId([
                'name'              => 'Piloto Demo',
                'email'             => 'piloto@danheiexpress.com',
                'phone'             => '311 220 6587',
                'password'          => Hash::make('Piloto2026!'),
                'email_verified_at' => $now,
                'driver_id'         => $driverId,
                'created_at'        => $now,
                'updated_at'        => $now,
            ]);
        }

        // Vincular driver al user
        DB::table('drivers')->where('id', $driverId)->update(['user_id' => $userId]);

        // ─── 3. Asignar rol conductor ───
        $conductorRoleId = DB::table('roles')->where('name', 'conductor')->value('id');
        if ($conductorRoleId) {
            DB::table('model_has_roles')->updateOrInsert(
                ['role_id' => $conductorRoleId, 'model_id' => $userId, 'model_type' => 'App\\Models\\User'],
            );
        }

        // ─── 4. Crear shipments demo variados ───
        $shipments = [
            [
                'tracking_code'     => 'DHE' . date('Ymd') . '00101',
                'display_code'      => '#DHE-7801',
                'status'            => 'in_transit',
                'recipient_name'    => 'María García',
                'recipient_phone'   => '310 555 1234',
                'recipient_address' => 'Cra 7 #72-41, Torre 2 Apto 803',
                'recipient_zone'    => 'Chapinero',
                'payment_type'      => 'cash_on_delivery',
                'cod_amount'        => 85000,
                'shipping_cost'     => 12000,
                'notes'             => 'Llamar antes de llegar. Portería requiere autorización.',
                'driver_id'         => $driverId,
            ],
            [
                'tracking_code'     => 'DHE' . date('Ymd') . '00102',
                'display_code'      => '#DHE-7802',
                'status'            => 'in_transit',
                'recipient_name'    => 'Juan Carlos Gómez',
                'recipient_phone'   => '320 444 5678',
                'recipient_address' => 'Cl 100 #15-20, Oficina 301',
                'recipient_zone'    => 'Usaquén',
                'payment_type'      => 'post_sale',
                'cod_amount'        => 0,
                'shipping_cost'     => 8500,
                'notes'             => 'Dejar en recepción si no hay nadie.',
                'driver_id'         => $driverId,
            ],
            [
                'tracking_code'     => 'DHE' . date('Ymd') . '00103',
                'display_code'      => '#DHE-7803',
                'status'            => 'delivered',
                'recipient_name'    => 'Tienda La Esquina - Doña Rosa',
                'recipient_phone'   => '315 222 9876',
                'recipient_address' => 'Cra 13 #53-20, Local 2',
                'recipient_zone'    => 'Chapinero',
                'payment_type'      => 'cash_on_delivery',
                'cod_amount'        => 125000,
                'shipping_cost'     => 10000,
                'notes'             => 'Paga en efectivo. Pedir factura.',
                'driver_id'         => $driverId,
            ],
            [
                'tracking_code'     => 'DHE' . date('Ymd') . '00104',
                'display_code'      => '#DHE-7804',
                'status'            => 'in_transit',
                'recipient_name'    => 'Andrés Felipe Rodríguez',
                'recipient_phone'   => '300 888 4321',
                'recipient_address' => 'Av Boyacá #64-11, Casa 15',
                'recipient_zone'    => 'Suba',
                'payment_type'      => 'cash_on_delivery',
                'cod_amount'        => 52000,
                'shipping_cost'     => 9000,
                'notes'             => '',
                'driver_id'         => $driverId,
            ],
            [
                'tracking_code'     => 'DHE' . date('Ymd') . '00105',
                'display_code'      => '#DHE-7805',
                'status'            => 'issue',
                'recipient_name'    => 'Sofía Martínez',
                'recipient_phone'   => '318 777 6543',
                'recipient_address' => 'Cl 26 #40-50, Apto 1201',
                'recipient_zone'    => 'Teusaquillo',
                'payment_type'      => 'post_sale',
                'cod_amount'        => 0,
                'shipping_cost'     => 11000,
                'notes'             => 'Dirección incorrecta. Cliente no contesta.',
                'driver_id'         => $driverId,
            ],
            [
                'tracking_code'     => 'DHE' . date('Ymd') . '00106',
                'display_code'      => '#DHE-7806',
                'status'            => 'delivered',
                'recipient_name'    => 'Restaurante El Buen Sabor',
                'recipient_phone'   => '312 666 7890',
                'recipient_address' => 'Cra 15 #85-10, Local 1',
                'recipient_zone'    => 'Chapinero',
                'payment_type'      => 'post_sale',
                'cod_amount'        => 0,
                'shipping_cost'     => 7500,
                'notes'             => 'Entregado al administrador.',
                'driver_id'         => $driverId,
            ],
            [
                'tracking_code'     => 'DHE' . date('Ymd') . '00107',
                'display_code'      => '#DHE-7807',
                'status'            => 'in_transit',
                'recipient_name'    => 'Camila Herrera',
                'recipient_phone'   => '321 333 2109',
                'recipient_address' => 'Cl 170 #9-20, Torre 3 Apto 502',
                'recipient_zone'    => 'Usaquén',
                'payment_type'      => 'cash_on_delivery',
                'cod_amount'        => 38000,
                'shipping_cost'     => 13000,
                'notes'             => 'Conjunto cerrado. Código portería: 4532.',
                'driver_id'         => $driverId,
            ],
            [
                'tracking_code'     => 'DHE' . date('Ymd') . '00108',
                'display_code'      => '#DHE-7808',
                'status'            => 'in_transit',
                'recipient_name'    => 'Diego Alejandro Vargas',
                'recipient_phone'   => '305 111 8765',
                'recipient_address' => 'Cra 68 #12-45, Bodega 3',
                'recipient_zone'    => 'Kennedy',
                'payment_type'      => 'cash_on_delivery',
                'cod_amount'        => 195000,
                'shipping_cost'     => 15000,
                'notes'             => 'Paquete grande. Entregar solo al titular con cédula.',
                'driver_id'         => $driverId,
            ],
        ];

        $shipmentIds = [];
        foreach ($shipments as $index => $s) {
            // Verificar si ya existe
            $existing = DB::table('shipments')->where('tracking_code', $s['tracking_code'])->first();
            if ($existing) {
                $shipmentIds[] = $existing->id;
                continue;
            }

            $shipmentIds[] = DB::table('shipments')->insertGetId(array_merge($s, [
                'sequence_number'  => 10000 + $index + 1,
                'financial_status' => $s['status'] === 'delivered' ? 'pending_collection' : 'none',
                'client_id'        => DB::table('clients')->inRandomOrder()->value('id') ?? 1,
                'created_by'       => $userId,
                'created_at'       => $now,
                'updated_at'       => $now,
            ]));
        }

        // ─── 5. Crear ruta de HOY ───
        $existingRoute = DB::table('routes')
            ->where('driver_id', $driverId)
            ->whereDate('route_date', $today)
            ->first();

        if ($existingRoute) {
            // Limpiar paradas anteriores
            DB::table('route_stops')->where('route_id', $existingRoute->id)->delete();
            $routeId = $existingRoute->id;
            DB::table('routes')->where('id', $routeId)->update([
                'status'          => 'active',
                'total_stops'     => count($shipmentIds),
                'completed_stops' => 2,  // 2 delivered
                'zone'            => 'Chapinero - Usaquén',
                'updated_at'      => $now,
            ]);
        } else {
            $routeId = DB::table('routes')->insertGetId([
                'driver_id'       => $driverId,
                'route_date'      => $today,
                'zone'            => 'Chapinero - Usaquén',
                'status'          => 'active',
                'total_stops'     => count($shipmentIds),
                'completed_stops' => 2,
                'created_at'      => $now,
                'updated_at'      => $now,
            ]);
        }

        // ─── 6. Crear paradas con estados variados ───
        $stopStatuses = [
            'pending',    // #7801 - COD $85k
            'pending',    // #7802 - post_sale
            'completed',  // #7803 - COD $125k (entregado)
            'pending',    // #7804 - COD $52k
            'skipped',    // #7805 - Novedad (shipment=issue, stop=skipped)
            'completed',  // #7806 - post_sale (entregado)
            'pending',    // #7807 - COD $38k
            'pending',    // #7808 - COD $195k (paquete grande)
        ];

        foreach ($shipmentIds as $index => $shipmentId) {
            DB::table('route_stops')->insert([
                'route_id'    => $routeId,
                'shipment_id' => $shipmentId,
                'sort_order'  => $index + 1,
                'status'      => $stopStatuses[$index],
                'created_at'  => $now,
                'updated_at'  => $now,
            ]);
        }

        $this->command->info("✅ Demo creado exitosamente:");
        $this->command->info("   👤 User: piloto@danheiexpress.com / Piloto2026!");
        $this->command->info("   🚚 Driver: Piloto Demo (ID: {$driverId})");
        $this->command->info("   📦 Shipments: " . count($shipmentIds) . " paquetes");
        $this->command->info("   🗺️  Ruta: ID {$routeId} ({$today}) - 8 paradas");
        $this->command->info("      ├── 2 completadas, 1 novedad, 5 pendientes");
        $this->command->info("      └── COD total pendiente: $370,000 COP");
    }
}
