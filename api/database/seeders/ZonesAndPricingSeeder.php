<?php

namespace Database\Seeders;

use App\Domain\Shared\Models\Notification;
use App\Domain\Shared\Models\PricingRule;
use App\Domain\Shared\Models\Zone;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ZonesAndPricingSeeder extends Seeder
{
    public function run(): void
    {
        // ── Zonas de cobertura (de la landing page de Danhei) ──

        $zones = [
            [
                'name' => 'Bogotá Centro',
                'city' => 'Bogotá',
                'type' => 'urban',
                'sort_order' => 1,
                'description' => 'Zona centro y centro-norte de Bogotá. Cobertura principal.',
                'pricing' => ['name' => 'Tarifa base Bogotá Centro', 'base_price' => 10000, 'type' => 'flat'],
            ],
            [
                'name' => 'Chapinero',
                'city' => 'Bogotá',
                'type' => 'urban',
                'sort_order' => 2,
                'description' => 'Chapinero alto y bajo, incluye Zona G y Zona T.',
                'pricing' => ['name' => 'Tarifa base Chapinero', 'base_price' => 10000, 'type' => 'flat'],
            ],
            [
                'name' => 'Usaquén',
                'city' => 'Bogotá',
                'type' => 'urban',
                'sort_order' => 3,
                'description' => 'Norte de Bogotá: Usaquén, Santa Bárbara, Cedritos.',
                'pricing' => ['name' => 'Tarifa base Usaquén', 'base_price' => 10000, 'type' => 'flat'],
            ],
            [
                'name' => 'Kennedy',
                'city' => 'Bogotá',
                'type' => 'urban',
                'sort_order' => 4,
                'description' => 'Zona suroccidente de Bogotá.',
                'pricing' => ['name' => 'Tarifa base Kennedy', 'base_price' => 11500, 'type' => 'flat'],
            ],
            [
                'name' => 'Soacha',
                'city' => 'Soacha',
                'type' => 'suburban',
                'sort_order' => 5,
                'description' => 'Municipio de Soacha, aledaño al sur de Bogotá.',
                'pricing' => ['name' => 'Tarifa Soacha', 'base_price' => 14000, 'type' => 'flat'],
            ],
            [
                'name' => 'Chía',
                'city' => 'Chía',
                'type' => 'suburban',
                'sort_order' => 6,
                'description' => 'Municipio de Chía al norte de Bogotá.',
                'pricing' => ['name' => 'Tarifa Chía', 'base_price' => 15000, 'type' => 'flat'],
            ],
            [
                'name' => 'Mosquera',
                'city' => 'Mosquera',
                'type' => 'suburban',
                'sort_order' => 7,
                'description' => 'Municipio de Mosquera al occidente de Bogotá.',
                'pricing' => ['name' => 'Tarifa Mosquera', 'base_price' => 15000, 'type' => 'flat'],
            ],
            [
                'name' => 'Zipaquirá',
                'city' => 'Zipaquirá',
                'type' => 'extended',
                'sort_order' => 8,
                'description' => 'Zipaquirá y alrededores. Cobertura extendida.',
                'pricing' => ['name' => 'Tarifa Zipaquirá', 'base_price' => 18000, 'type' => 'flat'],
            ],
            [
                'name' => 'Ruta al Llano',
                'city' => 'Villavicencio',
                'type' => 'extended',
                'sort_order' => 9,
                'is_active' => false,
                'description' => 'Próximamente: cobertura hacia los Llanos Orientales.',
                'pricing' => ['name' => 'Tarifa Llano (pendiente)', 'base_price' => 25000, 'type' => 'per_kg', 'per_kg_price' => 2000, 'is_active' => false],
            ],
        ];

        foreach ($zones as $zoneData) {
            $pricingData = $zoneData['pricing'];
            unset($zoneData['pricing']);

            $zoneData['slug'] = Str::slug($zoneData['name']);
            $zone = Zone::create($zoneData);

            PricingRule::create([
                'zone_id' => $zone->id,
                'name' => $pricingData['name'],
                'type' => $pricingData['type'] ?? 'flat',
                'base_price' => $pricingData['base_price'],
                'per_kg_price' => $pricingData['per_kg_price'] ?? 0,
                'min_price' => $pricingData['base_price'],
                'is_active' => $pricingData['is_active'] ?? true,
            ]);
        }

        // ── Notificaciones demo ───────────────────────

        $admin = User::where('email', 'admin@danheiexpress.com')->first();
        if ($admin) {
            Notification::send($admin->id, 'system', '¡Bienvenido a Danhei Express Admin!',
                'El sistema está configurado y listo. Puedes empezar a gestionar tus envíos.',
                '/', ['version' => '1.0']);

            Notification::send($admin->id, 'financial', '3 clientes con pagos pendientes',
                'Revisa las cuentas por cobrar en el módulo de pagos.',
                '/pagos');

            Notification::send($admin->id, 'shipment_status', 'Novedad en envío #DHE00004',
                'El envío tiene una novedad reportada: cliente no responde.',
                '/novedades');
        }

        $this->command->info('✅ Zonas: ' . count($zones) . ' zonas + tarifas creadas. 3 notificaciones demo.');
    }
}
