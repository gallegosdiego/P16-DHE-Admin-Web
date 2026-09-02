<?php

namespace Database\Seeders;

use App\Domain\Client\Models\Client;
use App\Domain\Client\Models\ClientAddress;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Models\ShipmentEvent;
use App\Domain\Operations\Enums\IntakeMode;
use App\Domain\Operations\Models\OperationalTask;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Pickup\Models\PickupRequest;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        // ── Sede Principal Demo ──────────────────────────
        \Illuminate\Support\Facades\DB::table('service_locations')->updateOrInsert(
            ['code' => 'HUB-PRINCIPAL'],
            [
                'name' => 'Sede Principal Bogotá',
                'address_line1' => 'Calle 13 # 15-48',
                'city' => 'Bogotá',
                'is_active' => 1,
                'location_type' => 'danhei_hub',
                'timezone' => 'America/Bogota',
            ]
        );

        // ── Clientes ──────────────────────────────────
        $clients = [
            ['name' => 'María Gómez', 'phone' => '310 123 4567', 'company' => null, 'billing_type' => 'cash_on_delivery'],
            ['name' => 'TiendaModa S.A.S.', 'phone' => '311 234 5678', 'email' => 'pedidos@tiendamoda.co', 'company' => 'TiendaModa S.A.S.', 'nit' => '900123456-7', 'billing_type' => 'post_sale'],
            ['name' => 'Carlos Ramírez', 'phone' => '312 345 6789', 'company' => null, 'billing_type' => 'cash_on_delivery'],
            ['name' => 'ServiYá Express', 'phone' => '313 456 7890', 'email' => 'ops@serviya.co', 'company' => 'ServiYá Express', 'nit' => '900234567-8', 'billing_type' => 'post_sale'],
            ['name' => 'Almacén MegaShop', 'phone' => '314 567 8901', 'email' => 'envios@megashop.co', 'company' => 'Almacén MegaShop', 'nit' => '900345678-9', 'billing_type' => 'post_sale'],
            ['name' => 'Pedro Rodríguez', 'phone' => '315 678 9012', 'company' => null, 'billing_type' => 'cash_on_delivery'],
            ['name' => 'Laura Mendoza', 'phone' => '316 789 0123', 'company' => null, 'billing_type' => 'cash_on_delivery'],
        ];

        $clientModels = [];
        foreach ($clients as $data) {
            $clientModels[] = Client::create($data);
        }

        $clientPortalUser = User::firstOrCreate(
            ['email' => 'maria@tiendamaria.com'],
            [
                'name' => 'María Gómez (Portal)',
                'password' => Hash::make('Cliente2026!'),
                'phone' => '301 234 5678',
                'client_id' => $clientModels[0]->id,
            ]
        );
        $clientPortalUser->update(['client_id' => $clientModels[0]->id]);
        $clientPortalUser->syncRoles(
            Role::query()->where('name', 'client')->whereIn('guard_name', ['web', 'sanctum'])->get()
        );

        // Direcciones
        ClientAddress::create(['client_id' => $clientModels[0]->id, 'address' => 'Cl 85 #15-20', 'zone' => 'Chapinero', 'label' => 'Casa']);
        ClientAddress::create(['client_id' => $clientModels[1]->id, 'address' => 'Cra 7 #45-12, Local 3', 'zone' => 'Centro', 'label' => 'Tienda']);
        ClientAddress::create(['client_id' => $clientModels[2]->id, 'address' => 'Av Suba #128-51', 'zone' => 'Suba', 'label' => 'Casa']);

        // ── Conductores ───────────────────────────────
        $drivers = [
            ['name' => 'Juan Pérez', 'initials' => 'JP', 'phone' => '320 111 2222', 'vehicle' => 'Moto', 'plate' => 'ABC 12D', 'zone' => 'Chapinero', 'status' => 'active', 'per_package_rate' => 3000],
            ['name' => 'Laura Sánchez', 'initials' => 'LS', 'phone' => '320 333 4444', 'vehicle' => 'Moto', 'plate' => 'DEF 34G', 'zone' => 'Suba', 'status' => 'route', 'per_package_rate' => 3000],
            ['name' => 'Carlos Torres', 'initials' => 'CT', 'phone' => '320 555 6666', 'vehicle' => 'Moto', 'plate' => 'GHI 56J', 'zone' => 'Kennedy', 'status' => 'active', 'per_package_rate' => 3500],
            ['name' => 'Ana Martínez', 'initials' => 'AM', 'phone' => '320 777 8888', 'vehicle' => 'Bicicleta', 'plate' => null, 'zone' => 'Centro', 'status' => 'active', 'per_package_rate' => 2500],
            ['name' => 'Diego Ruiz', 'initials' => 'DR', 'phone' => '320 999 0000', 'vehicle' => 'Moto', 'plate' => 'JKL 78M', 'zone' => 'Bosa', 'status' => 'inactive', 'per_package_rate' => 3000],
        ];

        $driverModels = [];
        foreach ($drivers as $data) {
            $driverModels[] = Driver::create($data);
        }

        // ── Envíos demo ───────────────────────────────
        $adminUser = User::where('email', 'admin@danheiexpress.com')->first();
        $shipments = [
            [
                'client_id' => $clientModels[0]->id,
                'driver_id' => $driverModels[0]->id,
                'recipient_name' => 'Ana López',
                'recipient_phone' => '317 111 2222',
                'recipient_address' => 'Cl 100 #20-30, Apto 501',
                'recipient_zone' => 'Usaquén',
                'status' => 'delivered',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 45000,
                'financial_status' => 'collected',
                'driver_fee' => 3000,
                'driver_paid' => false,
                'delivered_at' => now()->subHours(3),
            ],
            [
                'client_id' => $clientModels[1]->id,
                'driver_id' => $driverModels[1]->id,
                'recipient_name' => 'Roberto Díaz',
                'recipient_phone' => '318 222 3333',
                'recipient_address' => 'Cra 50 #12-45',
                'recipient_zone' => 'Suba',
                'status' => 'in_transit',
                'payment_type' => 'post_sale',
                'shipping_cost' => 9800,
                'cod_amount' => 0,
                'financial_status' => 'pending',
                'driver_fee' => 3000,
                'driver_paid' => false,
            ],
            [
                'client_id' => $clientModels[1]->id,
                'driver_id' => $driverModels[1]->id,
                'recipient_name' => 'Sandra Morales',
                'recipient_phone' => '319 333 4444',
                'recipient_address' => 'Av 68 #34-56',
                'recipient_zone' => 'Engativá',
                'status' => 'in_transit',
                'payment_type' => 'post_sale',
                'shipping_cost' => 11500,
                'cod_amount' => 0,
                'financial_status' => 'pending',
                'driver_fee' => 3000,
                'driver_paid' => false,
            ],
            [
                'client_id' => $clientModels[3]->id,
                'driver_id' => $driverModels[2]->id,
                'recipient_name' => 'Felipe Castillo',
                'recipient_phone' => '317 444 5555',
                'recipient_address' => 'Cl 13 #15-48',
                'recipient_zone' => 'Kennedy',
                'status' => 'issue',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 15000,
                'cod_amount' => 62000,
                'financial_status' => 'pending',
                'driver_fee' => 3500,
                'driver_paid' => false,
                'is_outsourced' => true,
                'outsource_company' => 'ServiYá Express',
                'outsource_amount' => 15000,
                'issue_note' => 'Destinatario no se encontraba. Se intentará de nuevo mañana.',
            ],
            [
                'client_id' => $clientModels[2]->id,
                'driver_id' => null,
                'recipient_name' => 'Gabriela Torres',
                'recipient_phone' => '316 555 6666',
                'recipient_address' => 'Cra 30 #80-15',
                'recipient_zone' => 'Teusaquillo',
                'status' => 'registered',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 35000,
                'financial_status' => 'pending',
                'driver_fee' => 3000,
                'driver_paid' => false,
            ],
            [
                'client_id' => $clientModels[4]->id,
                'driver_id' => $driverModels[0]->id,
                'recipient_name' => 'Camilo Vega',
                'recipient_phone' => '315 666 7777',
                'recipient_address' => 'Cl 72 #10-25',
                'recipient_zone' => 'Chapinero',
                'status' => 'delivered',
                'payment_type' => 'post_sale',
                'shipping_cost' => 13000,
                'cod_amount' => 0,
                'financial_status' => 'invoiced',
                'driver_fee' => 3000,
                'driver_paid' => true,
                'delivered_at' => now()->subDays(5),
            ],
            [
                'client_id' => $clientModels[4]->id,
                'driver_id' => $driverModels[3]->id,
                'recipient_name' => 'Valentina Ruiz',
                'recipient_phone' => '318 777 8888',
                'recipient_address' => 'Cra 10 #20-30',
                'recipient_zone' => 'Centro',
                'status' => 'delivered',
                'payment_type' => 'post_sale',
                'shipping_cost' => 9800,
                'cod_amount' => 0,
                'financial_status' => 'overdue',
                'driver_fee' => 2500,
                'driver_paid' => true,
                'delivered_at' => now()->subDays(18),
            ],
        ];

        $seq = 0;
        foreach ($shipments as $data) {
            $seq++;
            $date = now()->format('Ymd');

            $attributes = [
                ...$data,
                'created_by' => $adminUser->id,
                'tracking_code' => sprintf('DHE%s%05d', $date, $seq),
                'display_code' => sprintf('#DHE%05d', $seq),
                'public_token' => Str::random(32),
                'sequence_number' => $seq,
            ];
            $shipment = app()->environment('testing')
                ? Shipment::withoutEvents(fn () => Shipment::create($attributes))
                : Shipment::create($attributes);

            // Evento de creación
            ShipmentEvent::create([
                'shipment_id' => $shipment->id,
                'user_id' => $adminUser->id,
                'from_status' => null,
                'to_status' => 'registered',
                'description' => "Envío {$shipment->display_code} creado",
                'occurred_at' => now()->subHours(rand(1, 8)),
            ]);

            // Eventos adicionales según estado actual
            if (in_array($data['status'], ['in_transit', 'delivered', 'issue'])) {
                ShipmentEvent::create([
                    'shipment_id' => $shipment->id,
                    'user_id' => $adminUser->id,
                    'from_status' => 'registered',
                    'to_status' => 'confirmed',
                    'description' => 'Envío confirmado',
                    'occurred_at' => now()->subHours(rand(1, 6)),
                ]);
                ShipmentEvent::create([
                    'shipment_id' => $shipment->id,
                    'user_id' => $adminUser->id,
                    'from_status' => 'confirmed',
                    'to_status' => 'in_transit',
                    'description' => 'En ruta de entrega',
                    'occurred_at' => now()->subHours(rand(1, 4)),
                ]);
            }
            if ($data['status'] === 'delivered') {
                ShipmentEvent::create([
                    'shipment_id' => $shipment->id,
                    'user_id' => $adminUser->id,
                    'from_status' => 'in_transit',
                    'to_status' => 'delivered',
                    'description' => 'Paquete entregado exitosamente',
                    'occurred_at' => $data['delivered_at'] ?? now(),
                ]);
            }
            if ($data['status'] === 'issue') {
                ShipmentEvent::create([
                    'shipment_id' => $shipment->id,
                    'user_id' => $adminUser->id,
                    'from_status' => 'in_transit',
                    'to_status' => 'issue',
                    'description' => $data['issue_note'] ?? 'Novedad reportada',
                    'occurred_at' => now()->subHour(),
                ]);
            }
        }

        // ── Envíos adicionales (horas variadas para gráfica dashboard) ──
        $extraShipments = [
            ['recipient' => 'Diana Herrera', 'phone' => '319 100 2001', 'addr' => 'Cl 45 #12-30', 'zone' => 'Chapinero', 'hour' => 7, 'client' => 0, 'driver' => 0, 'status' => 'delivered', 'cost' => 10000, 'cod' => 38000, 'pt' => 'cash_on_delivery', 'fs' => 'settled'],
            ['recipient' => 'Andrés Molina', 'phone' => '318 200 3002', 'addr' => 'Cra 15 #80-12', 'zone' => 'Usaquén', 'hour' => 8, 'client' => 2, 'driver' => 0, 'status' => 'delivered', 'cost' => 12000, 'cod' => 55000, 'pt' => 'cash_on_delivery', 'fs' => 'collected'],
            ['recipient' => 'Sofía Parra', 'phone' => '317 300 4003', 'addr' => 'Av Boyacá #64-11', 'zone' => 'Engativá', 'hour' => 9, 'client' => 1, 'driver' => 1, 'status' => 'in_transit', 'cost' => 9800, 'cod' => 0, 'pt' => 'post_sale', 'fs' => 'pending'],
            ['recipient' => 'Miguel Ángel Castro', 'phone' => '316 400 5004', 'addr' => 'Cl 26 #40-50', 'zone' => 'Teusaquillo', 'hour' => 9, 'client' => 3, 'driver' => 2, 'status' => 'confirmed', 'cost' => 15000, 'cod' => 70000, 'pt' => 'cash_on_delivery', 'fs' => 'pending'],
            ['recipient' => 'Isabella Duarte', 'phone' => '315 500 6005', 'addr' => 'Cra 68 #12-45', 'zone' => 'Kennedy', 'hour' => 10, 'client' => 4, 'driver' => 2, 'status' => 'in_transit', 'cost' => 11500, 'cod' => 0, 'pt' => 'post_sale', 'fs' => 'pending'],
            ['recipient' => 'Sebastián Vargas', 'phone' => '314 600 7006', 'addr' => 'Cl 170 #9-20', 'zone' => 'Usaquén', 'hour' => 11, 'client' => 5, 'driver' => 0, 'status' => 'delivered', 'cost' => 13000, 'cod' => 48000, 'pt' => 'cash_on_delivery', 'fs' => 'collected'],
            ['recipient' => 'Mariana Ospina', 'phone' => '313 700 8007', 'addr' => 'Av 1 de Mayo #35-22', 'zone' => 'Bosa', 'hour' => 12, 'client' => 6, 'driver' => 3, 'status' => 'registered', 'cost' => 10500, 'cod' => 29000, 'pt' => 'cash_on_delivery', 'fs' => 'pending'],
            ['recipient' => 'Julián Restrepo', 'phone' => '312 800 9008', 'addr' => 'Cl 53 #25-18', 'zone' => 'Chapinero', 'hour' => 14, 'client' => 1, 'driver' => null, 'status' => 'registered', 'cost' => 11500, 'cod' => 0, 'pt' => 'post_sale', 'fs' => 'pending'],
        ];

        foreach ($extraShipments as $extra) {
            $seq++;
            $date = now()->format('Ymd');
            $createdAt = now()->setTime($extra['hour'], rand(0, 59), rand(0, 59));

            $attributes = [
                'client_id' => $clientModels[$extra['client']]->id,
                'driver_id' => $extra['driver'] !== null ? $driverModels[$extra['driver']]->id : null,
                'recipient_name' => $extra['recipient'],
                'recipient_phone' => $extra['phone'],
                'recipient_address' => $extra['addr'],
                'recipient_zone' => $extra['zone'],
                'status' => $extra['status'],
                'payment_type' => $extra['pt'],
                'shipping_cost' => $extra['cost'],
                'cod_amount' => $extra['cod'],
                'financial_status' => $extra['fs'],
                'driver_fee' => 3000,
                'driver_paid' => $extra['status'] === 'delivered',
                'delivered_at' => $extra['status'] === 'delivered' ? $createdAt->copy()->addHours(2) : null,
                'created_by' => $adminUser->id,
                'tracking_code' => sprintf('DHE%s%05d', $date, $seq),
                'display_code' => sprintf('#DHE%05d', $seq),
                'public_token' => Str::random(32),
                'sequence_number' => $seq,
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ];
            $shipment = app()->environment('testing')
                ? Shipment::withoutEvents(fn () => Shipment::create($attributes))
                : Shipment::create($attributes);

            ShipmentEvent::create([
                'shipment_id' => $shipment->id,
                'user_id' => $adminUser->id,
                'from_status' => null,
                'to_status' => 'registered',
                'description' => "Envío {$shipment->display_code} creado",
                'occurred_at' => $createdAt,
            ]);
        }

        // ── Tarea operativa hub_intake Demo ──────────────────────────
        if (app()->environment('local', 'testing', 'staging')) {
            $hubLocation = \App\Domain\Operations\Models\ServiceLocation::where('code', 'HUB-PRINCIPAL')->first();

            if ($hubLocation && isset($clientModels[1])) {
                $pickupRequest = PickupRequest::firstOrCreate(
                    ['pickup_code' => 'PR-DEMO-HUB01'],
                    [
                        'customer_id' => $clientModels[1]->id,
                        'source' => 'admin',
                        'intake_mode' => IntakeMode::PLANNED_DROPOFF_AT_HUB,
                        'service_location_id' => $hubLocation->id,
                        'pickup_address_line1' => $hubLocation->address_line1 ?? 'Calle 13 # 15-48',
                        'pickup_city' => $hubLocation->city ?? 'Bogotá',
                        'pickup_zone' => $hubLocation->zone ?? 'Centro',
                        'correlation_id' => (string) Str::uuid(),
                        'planned_dropoff_at' => now()->addHours(2),
                        'status' => PickupStatus::SUBMITTED,
                        'contact_name' => 'Carlos Mendoza',
                        'contact_phone' => '311 234 5678',
                        'contact_email' => 'pedidos@tiendamoda.co',
                        'sender_company' => 'TiendaModa S.A.S.',
                        'pickup_window_code' => 'TODAY_PM',
                        'pickup_window_label' => 'Hoy en la tarde',
                        'package_count' => 3,
                        'requested_cod_total' => 125000,
                        'special_instructions' => 'Entrega de paquetes demo en sede HUB-PRINCIPAL para recepción y conciliación.',
                        'submitted_at' => now(),
                        'ready_for_assignment_at' => now(),
                    ]
                );

                if ($pickupRequest->wasRecentlyCreated || $pickupRequest->packages()->count() === 0) {
                    $packages = [
                        [
                            'package_index' => 1,
                            'recipient_name' => 'Laura Ospina',
                            'recipient_phone' => '300 111 2233',
                            'delivery_address_line1' => 'Calle 100 # 15-20',
                            'delivery_city' => 'Bogotá',
                            'delivery_zone' => 'Usaquén',
                            'is_cod' => true,
                            'requested_cod_amount' => 45000,
                            'is_fragile' => false,
                            'package_type' => 'box',
                            'size_code' => 'M',
                            'approx_weight_kg' => 2.5,
                        ],
                        [
                            'package_index' => 2,
                            'recipient_name' => 'Felipe Torres',
                            'recipient_phone' => '301 222 3344',
                            'delivery_address_line1' => 'Carrera 7 # 45-10',
                            'delivery_city' => 'Bogotá',
                            'delivery_zone' => 'Chapinero',
                            'is_cod' => true,
                            'requested_cod_amount' => 80000,
                            'is_fragile' => true,
                            'package_type' => 'envelope',
                            'size_code' => 'S',
                            'approx_weight_kg' => 0.8,
                        ],
                        [
                            'package_index' => 3,
                            'recipient_name' => 'Camila Restrepo',
                            'recipient_phone' => '302 333 4455',
                            'delivery_address_line1' => 'Av El Dorado # 68-90',
                            'delivery_city' => 'Bogotá',
                            'delivery_zone' => 'Teusaquillo',
                            'is_cod' => false,
                            'requested_cod_amount' => 0,
                            'is_fragile' => false,
                            'package_type' => 'box',
                            'size_code' => 'L',
                            'approx_weight_kg' => 4.0,
                        ],
                    ];

                    foreach ($packages as $pkgData) {
                        PickupPackage::create(array_merge($pkgData, [
                            'pickup_request_id' => $pickupRequest->id,
                        ]));
                    }

                    $pickupRequest->update(['status' => PickupStatus::ACCEPTED]);
                    $materializer = app(\App\Domain\Pickup\Services\MaterializePickupShipments::class);
                    $materializer->execute($pickupRequest, [
                        'default_shipping_cost' => 11500,
                        'default_driver_fee' => 3000,
                    ], $adminUser);
                }

                $existingTask = OperationalTask::where('pickup_request_id', $pickupRequest->id)->first();
                if (! $existingTask) {
                    $taskService = app(OperationalTaskService::class);
                    $taskService->createForPickupRequest($pickupRequest, [
                        'task_code' => 'OT-DEMO-HUB01',
                        'priority' => 1,
                        'notes' => 'Tarea de recepción programada en sede HUB-PRINCIPAL',
                        'scheduled_date' => now()->toDateString(),
                    ]);
                }
            }
        }

        $this->command->info(sprintf(
            '✅ Datos demo: %d envíos, %d clientes, %d conductores.',
            $seq,
            count($clients),
            count($drivers),
        ));
    }
}
