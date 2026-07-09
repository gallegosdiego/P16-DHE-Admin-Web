<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Shared\Models\Zone;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Services\GeocodingService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ShipmentTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
    }

    public function test_can_create_shipment_with_auto_tracking(): void
    {
        $client = Client::create([
            'name' => 'Test Cliente',
            'phone' => '310 000 0000',
            'billing_type' => 'cash_on_delivery',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Juan Prueba',
                'recipient_phone' => '311 111 1111',
                'recipient_address' => 'Cl 100 #20-30',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 50000,
            ]);

        $response->assertCreated()
            ->assertJsonStructure([
                'id', 'tracking_code', 'display_code', 'status',
            ]);

        // Verificar guía generada
        $data = $response->json();
        $this->assertStringStartsWith('DHE', $data['tracking_code']);
        $this->assertStringStartsWith('#DHE', $data['display_code']);
        $this->assertEquals('registered', $data['status']);

        // Verificar evento de creación
        $this->assertDatabaseHas('shipment_events', [
            'shipment_id' => $data['id'],
            'to_status' => 'registered',
        ]);
    }

    public function test_create_shipment_geocodes_when_city_is_present(): void
    {
        $client = Client::create([
            'name' => 'Cliente Geo',
            'phone' => '310 000 1000',
            'billing_type' => 'cash_on_delivery',
        ]);

        $geocoder = new class extends GeocodingService
        {
            public array $calls = [];

            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                $this->calls[] = compact('address', 'city', 'zone');

                return ['lat' => 4.6521, 'lng' => -74.1043];
            }
        };

        $this->app->instance(GeocodingService::class, $geocoder);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Cliente con geo',
                'recipient_phone' => '311 222 3333',
                'recipient_address' => 'Cra 10 #20-30',
                'recipient_city' => 'Bogota',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 12000,
            ]);

        $response->assertCreated()
            ->assertJsonPath('recipient_lat', 4.6521)
            ->assertJsonPath('recipient_lng', -74.1043)
            ->assertJsonPath('has_coordinates', true)
            ->assertJsonPath('geocoding_pending', false);

        $this->assertCount(1, $geocoder->calls);
        $this->assertDatabaseHas('shipments', [
            'id' => $response->json('id'),
            'recipient_city' => 'Bogota',
        ]);
    }

    public function test_create_shipment_normalizes_location_fields_before_geocoding(): void
    {
        $client = Client::create([
            'name' => 'Cliente Geo Limpio',
            'phone' => '310 000 1001',
            'billing_type' => 'cash_on_delivery',
        ]);

        $geocoder = new class extends GeocodingService
        {
            public array $calls = [];

            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                $this->calls[] = compact('address', 'city', 'zone');

                return ['lat' => 4.6521, 'lng' => -74.1043];
            }
        };

        $this->app->instance(GeocodingService::class, $geocoder);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Cliente con geo',
                'recipient_phone' => '311 222 3333',
                'recipient_address' => 'calle 22 #14-05, chapinero, bogotá',
                'recipient_zone' => 'chapinero',
                'recipient_city' => 'Bogotá',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 12000,
            ]);

        $response->assertCreated()
            ->assertJsonPath('recipient_address', 'Calle 22 # 14-05')
            ->assertJsonPath('recipient_zone', 'Chapinero')
            ->assertJsonPath('recipient_city', 'Bogota')
            ->assertJsonPath('recipient_lat', 4.6521)
            ->assertJsonPath('recipient_lng', -74.1043);

        $this->assertSame('Calle 22 # 14-05', $geocoder->calls[0]['address'] ?? null);
        $this->assertSame('Bogota', $geocoder->calls[0]['city'] ?? null);
        $this->assertSame('Chapinero', $geocoder->calls[0]['zone'] ?? null);
    }

    public function test_create_shipment_accepts_structured_address_builder_fields(): void
    {
        $client = Client::create([
            'name' => 'Cliente Address Builder',
            'phone' => '310 000 1002',
            'billing_type' => 'cash_on_delivery',
        ]);

        $geocoder = new class extends GeocodingService
        {
            public array $calls = [];

            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                $this->calls[] = compact('address', 'city', 'zone');

                return ['lat' => 4.6112, 'lng' => -74.1881];
            }
        };

        $this->app->instance(GeocodingService::class, $geocoder);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Jonathan Builder',
                'recipient_phone' => '311 444 5566',
                'recipient_address' => 'Temporal',
                'address_mode' => 'structured',
                'address_road_type' => 'calle',
                'address_road_number' => '135',
                'address_cross_number' => '103f',
                'address_property_number' => '64',
                'address_unit_details' => 'torre 2 apto 301',
                'address_neighborhood' => 'bosa central',
                'address_reference' => 'junto al parque',
                'recipient_zone' => 'Bosa',
                'recipient_city' => 'Bogota',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 12000,
            ]);

        $response->assertCreated()
            ->assertJsonPath('recipient_address', 'Calle 135 # 103F-64, Torre 2 Apartamento 301, Bosa Central')
            ->assertJsonPath('recipient_address_meta.mode', 'structured')
            ->assertJsonPath('recipient_address_meta.road_type', 'calle')
            ->assertJsonPath('recipient_address_meta.road_number', '135')
            ->assertJsonPath('recipient_address_meta.cross_number', '103F')
            ->assertJsonPath('recipient_address_meta.property_number', '64')
            ->assertJsonPath('recipient_address_meta.reference', 'Junto Al Parque');

        $this->assertSame(
            'Calle 135 # 103F-64, Torre 2 Apartamento 301, Bosa Central',
            $geocoder->calls[0]['address'] ?? null
        );
    }

    public function test_update_shipment_rebuilds_structured_address_and_meta(): void
    {
        $client = Client::create([
            'name' => 'Cliente Update Builder',
            'phone' => '310 000 1003',
            'billing_type' => 'cash_on_delivery',
        ]);

        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026070800010',
            'display_code' => '#DHE74010',
            'sequence_number' => 74010,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Previo',
            'recipient_phone' => '3110000010',
            'recipient_address' => 'Cl 10 #10-10',
            'recipient_zone' => 'Chapinero',
            'recipient_city' => 'Bogota',
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => 10000,
            'financial_status' => 'pending',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/shipments/{$shipment->id}", [
                'address_mode' => 'structured',
                'address_road_type' => 'carrera',
                'address_road_number' => '13',
                'address_cross_number' => '58',
                'address_property_number' => '10',
                'address_unit_details' => 'oficina 502',
                'address_neighborhood' => 'chapinero',
                'recipient_zone' => 'Chapinero',
                'recipient_city' => 'Bogota',
            ]);

        $response->assertOk()
            ->assertJsonPath('recipient_address', 'Carrera 13 # 58-10, Oficina 502')
            ->assertJsonPath('recipient_address_meta.mode', 'structured')
            ->assertJsonPath('recipient_address_meta.road_type', 'carrera');
    }

    public function test_create_shipment_rejects_partial_manual_coordinates(): void
    {
        $client = Client::create([
            'name' => 'Cliente Coordenadas',
            'phone' => '310 000 1099',
            'billing_type' => 'cash_on_delivery',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Cliente parcial',
                'recipient_phone' => '311 000 0001',
                'recipient_address' => 'Calle parcial #1',
                'recipient_city' => 'Bogota',
                'recipient_lat' => 4.6501,
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 10000,
                'cod_amount' => 10000,
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['recipient_lng']);
    }

    public function test_create_shipment_rejects_address_without_locatable_reference(): void
    {
        $client = Client::create([
            'name' => 'Cliente Direccion Debil',
            'phone' => '310 000 1010',
            'billing_type' => 'cash_on_delivery',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Cliente sin referencia',
                'recipient_phone' => '311 000 0010',
                'recipient_address' => 'Frente al parque',
                'recipient_city' => 'Bogota',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 10000,
                'cod_amount' => 10000,
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['recipient_address']);
    }

    public function test_create_shipment_geocodes_when_city_is_omitted_and_zone_resolves_it(): void
    {
        Zone::create([
            'name' => 'Chapinero',
            'city' => 'Bogota',
            'type' => 'urban',
            'is_active' => true,
        ]);

        $client = Client::create([
            'name' => 'Cliente Geo Zona',
            'phone' => '310 000 1099',
            'billing_type' => 'cash_on_delivery',
        ]);

        $geocoder = new class extends GeocodingService
        {
            public array $calls = [];

            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                $this->calls[] = compact('address', 'city', 'zone');

                return ['lat' => 4.6533, 'lng' => -74.0631];
            }
        };

        $this->app->instance(GeocodingService::class, $geocoder);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Cliente sin ciudad',
                'recipient_phone' => '311 777 8899',
                'recipient_address' => 'Cra 13 #58-10',
                'recipient_zone' => 'Chapinero',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 15000,
            ]);

        $response->assertCreated()
            ->assertJsonPath('recipient_city', 'Bogota')
            ->assertJsonPath('recipient_lat', 4.6533)
            ->assertJsonPath('recipient_lng', -74.0631)
            ->assertJsonPath('has_coordinates', true)
            ->assertJsonPath('geocoding_pending', false);

        $this->assertCount(1, $geocoder->calls);
        $this->assertSame('Bogota', $geocoder->calls[0]['city']);
        $this->assertSame('Chapinero', $geocoder->calls[0]['zone']);
    }

    public function test_create_shipment_infers_zone_and_city_from_address_catalog(): void
    {
        Zone::create([
            'name' => 'Bosa',
            'city' => 'Bogota',
            'type' => 'urban',
            'is_active' => true,
        ]);

        $client = Client::create([
            'name' => 'Cliente Inferencia Catalogo',
            'phone' => '310 000 1100',
            'billing_type' => 'cash_on_delivery',
        ]);

        $geocoder = new class extends GeocodingService
        {
            public array $calls = [];

            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                $this->calls[] = compact('address', 'city', 'zone');

                return ['lat' => 4.6175, 'lng' => -74.1861];
            }
        };

        $this->app->instance(GeocodingService::class, $geocoder);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Cliente catalogo',
                'recipient_phone' => '311 222 9900',
                'recipient_address' => 'Calle 135 #103F 64, Bosa',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 12000,
            ]);

        $response->assertCreated()
            ->assertJsonPath('recipient_zone', 'Bosa')
            ->assertJsonPath('recipient_city', 'Bogota')
            ->assertJsonPath('recipient_lat', 4.6175)
            ->assertJsonPath('recipient_lng', -74.1861);

        $this->assertSame('Bosa', $geocoder->calls[0]['zone'] ?? null);
        $this->assertSame('Bogota', $geocoder->calls[0]['city'] ?? null);
    }

    public function test_create_shipment_falls_back_to_zone_centroid_when_geocoder_returns_null(): void
    {
        Zone::create([
            'name' => 'Chapinero',
            'city' => 'Bogota',
            'type' => 'urban',
            'is_active' => true,
            'lat_min' => 4.6400000,
            'lat_max' => 4.6600000,
            'lng_min' => -74.0700000,
            'lng_max' => -74.0500000,
        ]);

        $client = Client::create([
            'name' => 'Cliente Fallback Zona',
            'phone' => '310 000 1011',
            'billing_type' => 'cash_on_delivery',
        ]);

        $geocoder = new class extends GeocodingService
        {
            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                return null;
            }
        };

        $this->app->instance(GeocodingService::class, $geocoder);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Cliente sin match exacto',
                'recipient_phone' => '311 777 5500',
                'recipient_address' => 'Direccion ambigua',
                'recipient_zone' => 'Chapinero',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 15000,
            ]);

        $response->assertCreated()
            ->assertJsonPath('recipient_city', 'Bogota')
            ->assertJsonPath('recipient_lat', 4.65)
            ->assertJsonPath('recipient_lng', -74.06)
            ->assertJsonPath('has_coordinates', true)
            ->assertJsonPath('geocoding_pending', false);
    }

    public function test_update_shipment_geocodes_when_city_is_added_later(): void
    {
        $client = Client::create([
            'name' => 'Cliente Geo Update',
            'phone' => '310 000 1001',
            'billing_type' => 'cash_on_delivery',
        ]);

        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026070200001',
            'display_code' => '#DHE70001',
            'sequence_number' => 70001,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Sin ciudad',
            'recipient_phone' => '3000000001',
            'recipient_address' => 'Cl 45 #10-20',
            'recipient_city' => 'Bogota',
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]);

        $geocoder = new class extends GeocodingService
        {
            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                return ['lat' => 4.7001, 'lng' => -74.0502];
            }
        };

        $this->app->instance(GeocodingService::class, $geocoder);

        $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/shipments/{$shipment->id}", [
                'recipient_address' => 'Cl 46 #11-21',
            ])
            ->assertOk()
            ->assertJsonPath('recipient_lat', 4.7001)
            ->assertJsonPath('recipient_lng', -74.0502);
    }

    public function test_update_shipment_rejects_partial_manual_coordinates(): void
    {
        $shipment = Shipment::create([
            'tracking_code' => 'DHEPARTIALUPD1',
            'display_code' => '#DHE90101',
            'sequence_number' => 90101,
            'client_id' => Client::create([
                'name' => 'Cliente update parcial',
                'phone' => '310 555 8899',
                'billing_type' => 'cash_on_delivery',
            ])->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Cliente update',
            'recipient_phone' => '311 000 0002',
            'recipient_address' => 'Cra parcial #2',
            'recipient_city' => 'Bogota',
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => 10000,
            'financial_status' => 'pending',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/shipments/{$shipment->id}", [
                'recipient_lng' => -74.0712,
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['recipient_lat']);
    }

    public function test_repair_geodata_clears_orphan_coordinate_pairs_before_reporting_result(): void
    {
        $client = Client::create([
            'name' => 'Cliente orphan geo',
            'phone' => '310 000 2000',
            'billing_type' => 'cash_on_delivery',
        ]);

        $shipment = Shipment::create([
            'tracking_code' => 'DHEORPHANGEO1',
            'display_code' => '#DHE90102',
            'sequence_number' => 90102,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Cliente orphan',
            'recipient_phone' => '311 000 0003',
            'recipient_address' => 'Direccion orphan',
            'recipient_city' => 'Bogota',
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'cod_amount' => 10000,
            'financial_status' => 'pending',
        ]);

        DB::table('shipments')
            ->where('id', $shipment->id)
            ->update([
                'recipient_lat' => 4.6111,
                'recipient_lng' => null,
                'geocoded_at' => now(),
            ]);

        $geocoder = new class extends GeocodingService
        {
            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                return null;
            }
        };

        $this->app->instance(GeocodingService::class, $geocoder);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments/repair-geodata', [
                'shipment_ids' => [$shipment->id],
            ]);

        $response->assertOk()
            ->assertJsonPath('shipments.0.recipient_lat', null)
            ->assertJsonPath('shipments.0.recipient_lng', null)
            ->assertJsonPath('shipments.0.has_coordinates', false);

        $shipment->refresh();

        $this->assertNull($shipment->recipient_lat);
        $this->assertNull($shipment->recipient_lng);
        $this->assertNull($shipment->geocoded_at);
    }

    public function test_create_shipment_falls_back_to_zone_geocode_when_zone_has_no_bounds(): void
    {
        Zone::create([
            'name' => 'Chapinero',
            'city' => 'Bogota',
            'type' => 'urban',
            'is_active' => true,
            'lat_min' => null,
            'lat_max' => null,
            'lng_min' => null,
            'lng_max' => null,
        ]);

        $client = Client::create([
            'name' => 'Cliente Zona Sin Bounds',
            'phone' => '310 000 1012',
            'billing_type' => 'cash_on_delivery',
        ]);

        $geocoder = new class extends GeocodingService
        {
            public array $calls = [];

            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                $this->calls[] = compact('address', 'city', 'zone');

                if ($address === 'Direccion dificil') {
                    return null;
                }

                if ($address === 'Chapinero' && $city === 'Bogota') {
                    return ['lat' => 4.6486, 'lng' => -74.0627];
                }

                return null;
            }
        };

        $this->app->instance(GeocodingService::class, $geocoder);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Cliente fallback zona geocode',
                'recipient_phone' => '311 777 5511',
                'recipient_address' => 'Direccion dificil',
                'recipient_zone' => 'Chapinero',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 15000,
            ]);

        $response->assertCreated()
            ->assertJsonPath('recipient_city', 'Bogota')
            ->assertJsonPath('recipient_lat', 4.6486)
            ->assertJsonPath('recipient_lng', -74.0627)
            ->assertJsonPath('has_coordinates', true)
            ->assertJsonPath('geocoding_pending', false);

        $this->assertCount(2, $geocoder->calls);
        $this->assertSame('Direccion Dificil', $geocoder->calls[0]['address']);
        $this->assertSame('Chapinero', $geocoder->calls[1]['address']);
        $this->assertSame('Bogota', $geocoder->calls[1]['city']);
    }

    public function test_create_shipment_falls_back_to_zone_geocode_even_when_zone_is_not_in_catalog(): void
    {
        $client = Client::create([
            'name' => 'Cliente Zona Libre',
            'phone' => '310 000 1014',
            'billing_type' => 'cash_on_delivery',
        ]);

        $geocoder = new class extends GeocodingService
        {
            public array $calls = [];

            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                $this->calls[] = compact('address', 'city', 'zone');

                if ($address === 'Calle 135 # 103f-64') {
                    return null;
                }

                if ($address === 'Bosa' && $city === 'Bogota') {
                    return ['lat' => 4.6142, 'lng' => -74.1948];
                }

                return null;
            }
        };

        $this->app->instance(GeocodingService::class, $geocoder);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Cliente Bosa',
                'recipient_phone' => '311 777 5522',
                'recipient_address' => 'Calle 135 # 103F-64',
                'recipient_zone' => 'Bosa',
                'recipient_city' => 'Bogota',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 15000,
            ]);

        $response->assertCreated()
            ->assertJsonPath('recipient_lat', 4.6142)
            ->assertJsonPath('recipient_lng', -74.1948)
            ->assertJsonPath('has_coordinates', true)
            ->assertJsonPath('geocoding_pending', false);

        $this->assertCount(2, $geocoder->calls);
        $this->assertSame('Bosa', $geocoder->calls[1]['address']);
        $this->assertSame('Bogota', $geocoder->calls[1]['city']);
    }

    public function test_create_shipment_falls_back_to_city_geocode_when_address_and_zone_fail(): void
    {
        $client = Client::create([
            'name' => 'Cliente Ciudad Fallback',
            'phone' => '310 000 1015',
            'billing_type' => 'cash_on_delivery',
        ]);

        $geocoder = new class extends GeocodingService
        {
            public array $calls = [];

            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                $this->calls[] = compact('address', 'city', 'zone');

                if ($address === 'Bogota' && $city === 'Bogota') {
                    return ['lat' => 4.711, 'lng' => -74.0721];
                }

                return null;
            }
        };

        $this->app->instance(GeocodingService::class, $geocoder);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Cliente fallback ciudad',
                'recipient_phone' => '311 777 5533',
                'recipient_address' => 'Direccion sin match',
                'recipient_zone' => 'Zona Inventada',
                'recipient_city' => 'Bogota',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 15000,
            ]);

        $response->assertCreated()
            ->assertJsonPath('recipient_lat', 4.711)
            ->assertJsonPath('recipient_lng', -74.0721)
            ->assertJsonPath('has_coordinates', true)
            ->assertJsonPath('geocoding_pending', false);

        $this->assertCount(3, $geocoder->calls);
        $this->assertSame('Bogota', $geocoder->calls[2]['address']);
        $this->assertSame('Bogota', $geocoder->calls[2]['city']);
    }

    public function test_repair_geodata_endpoint_repairs_selected_shipments(): void
    {
        Zone::create([
            'name' => 'Chapinero',
            'city' => 'Bogota',
            'type' => 'urban',
            'is_active' => true,
            'lat_min' => 4.6400000,
            'lat_max' => 4.6600000,
            'lng_min' => -74.0700000,
            'lng_max' => -74.0500000,
        ]);

        $client = Client::create([
            'name' => 'Cliente Repara Geo',
            'phone' => '310 000 1013',
            'billing_type' => 'cash_on_delivery',
        ]);

        $shipment = Shipment::withoutEvents(fn () => Shipment::create([
            'tracking_code' => 'DHE2026070400123',
            'display_code' => '#DHE70123',
            'sequence_number' => 70123,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Pendiente geo',
            'recipient_phone' => '3000000900',
            'recipient_address' => 'Direccion por reparar',
            'recipient_zone' => 'Chapinero',
            'recipient_city' => '',
            'recipient_lat' => null,
            'recipient_lng' => null,
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]));

        $geocoder = new class extends GeocodingService
        {
            public function geocode(string $address, string $city, ?string $zone = null): ?array
            {
                return null;
            }
        };

        $this->app->instance(GeocodingService::class, $geocoder);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments/repair-geodata', [
                'shipment_ids' => [$shipment->id],
            ]);

        $response->assertOk()
            ->assertJsonPath('summary.processed', 1)
            ->assertJsonPath('summary.repaired', 1)
            ->assertJsonPath('summary.city_resolved', 1)
            ->assertJsonPath('summary.still_missing', 0)
            ->assertJsonPath('shipments.0.id', $shipment->id)
            ->assertJsonPath('shipments.0.recipient_city', 'Bogota')
            ->assertJsonPath('shipments.0.has_coordinates', true)
            ->assertJsonPath('shipments.0.geocoding_pending', false)
            ->assertJsonPath('shipments.0.geocoding_status', 'ready')
            ->assertJsonPath('shipments.0.geocoding_reason', null)
            ->assertJsonPath('shipments.0.geocoding_reason_label', null);

        $shipment->refresh();

        $this->assertSame('Bogota', $shipment->recipient_city);
        $this->assertNotNull($shipment->recipient_lat);
        $this->assertNotNull($shipment->recipient_lng);
    }

    public function test_shipments_index_filters_by_coordinates_and_pending_geocoding(): void
    {
        $client = Client::create([
            'name' => 'Cliente Filtros Geo',
            'phone' => '310 000 1002',
            'billing_type' => 'cash_on_delivery',
        ]);

        Shipment::withoutEvents(fn () => Shipment::create([
            'tracking_code' => 'DHE2026070200002',
            'display_code' => '#DHE70002',
            'sequence_number' => 70002,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Con coords',
            'recipient_phone' => '3000000002',
            'recipient_address' => 'Cl 10 #10-10',
            'recipient_city' => 'Bogota',
            'recipient_lat' => 4.61,
            'recipient_lng' => -74.08,
            'geocoded_at' => now(),
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]));

        Shipment::withoutEvents(fn () => Shipment::create([
            'tracking_code' => 'DHE2026070200003',
            'display_code' => '#DHE70003',
            'sequence_number' => 70003,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Sin coords',
            'recipient_phone' => '3000000003',
            'recipient_address' => 'Cl 11 #11-11',
            'recipient_city' => 'Bogota',
            'recipient_lat' => null,
            'recipient_lng' => null,
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]));

        $withCoords = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/shipments?has_coordinates=1');
        $withCoords->assertOk();
        $this->assertCount(1, $withCoords->json('data'));
        $this->assertTrue($withCoords->json('data.0.has_coordinates'));

        $pendingGeo = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/shipments?needs_geocoding=1');
        $pendingGeo->assertOk();
        $this->assertCount(1, $pendingGeo->json('data'));
        $this->assertTrue($pendingGeo->json('data.0.geocoding_pending'));
    }

    public function test_geo_summary_returns_coordinate_coverage(): void
    {
        $client = Client::create([
            'name' => 'Cliente Summary Geo',
            'phone' => '310 000 1003',
            'billing_type' => 'cash_on_delivery',
        ]);

        Shipment::withoutEvents(fn () => Shipment::create([
            'tracking_code' => 'DHE2026070200004',
            'display_code' => '#DHE70004',
            'sequence_number' => 70004,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Coord ok',
            'recipient_phone' => '3000000004',
            'recipient_address' => 'Cl 20 #20-20',
            'recipient_city' => 'Bogota',
            'recipient_lat' => 4.62,
            'recipient_lng' => -74.07,
            'geocoded_at' => now(),
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]));

        Shipment::withoutEvents(fn () => Shipment::create([
            'tracking_code' => 'DHE2026070200005',
            'display_code' => '#DHE70005',
            'sequence_number' => 70005,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Coord pendiente',
            'recipient_phone' => '3000000005',
            'recipient_address' => 'Cl 21 #21-21',
            'recipient_city' => 'Bogota',
            'recipient_lat' => null,
            'recipient_lng' => null,
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]));

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/shipments/geo-summary');

        $response->assertOk()
            ->assertJsonPath('summary.with_coordinates', 1)
            ->assertJsonPath('summary.without_coordinates', 1)
            ->assertJsonPath('summary.pending_geocoding', 1);
    }

    public function test_geo_summary_supports_search_filter(): void
    {
        $client = Client::create([
            'name' => 'Cliente Search Geo',
            'phone' => '310 000 1004',
            'billing_type' => 'cash_on_delivery',
        ]);

        Shipment::withoutEvents(fn () => Shipment::create([
            'tracking_code' => 'DHE2026070200006',
            'display_code' => '#DHE70006',
            'sequence_number' => 70006,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Busqueda con geo',
            'recipient_phone' => '3000000006',
            'recipient_address' => 'Cl 60 #10-10',
            'recipient_city' => 'Bogota',
            'recipient_lat' => 4.65,
            'recipient_lng' => -74.09,
            'geocoded_at' => now(),
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]));

        Shipment::withoutEvents(fn () => Shipment::create([
            'tracking_code' => 'DHE2026070200007',
            'display_code' => '#DHE70007',
            'sequence_number' => 70007,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Busqueda sin geo',
            'recipient_phone' => '3000000007',
            'recipient_address' => 'Cl 61 #11-11',
            'recipient_city' => 'Bogota',
            'recipient_lat' => null,
            'recipient_lng' => null,
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]));

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/shipments/geo-summary?search=sin geo');

        $response->assertOk()
            ->assertJsonPath('summary.total', 1)
            ->assertJsonPath('summary.with_coordinates', 0)
            ->assertJsonPath('summary.without_coordinates', 1)
            ->assertJsonPath('recent_missing.0.recipient_name', 'Busqueda sin geo')
            ->assertJsonPath('recent_missing.0.geocoding_status', 'pending')
            ->assertJsonPath('recent_missing.0.geocoding_reason', 'provider_no_match')
            ->assertJsonPath('recent_missing.0.geocoding_reason_label', 'Proveedor sin coincidencia exacta');
    }

    public function test_geo_summary_marks_blocked_addresses_with_reason_label(): void
    {
        $client = Client::create([
            'name' => 'Cliente Geo Bloqueado',
            'phone' => '310 000 1008',
            'billing_type' => 'cash_on_delivery',
        ]);

        Shipment::withoutEvents(fn () => Shipment::create([
            'tracking_code' => 'DHE2026070200008',
            'display_code' => '#DHE70008',
            'sequence_number' => 70008,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Direccion corta',
            'recipient_phone' => '3000000008',
            'recipient_address' => 'Cl 2',
            'recipient_city' => 'Bogota',
            'recipient_lat' => null,
            'recipient_lng' => null,
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]));

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/shipments/geo-summary?search=Direccion corta');

        $response->assertOk()
            ->assertJsonPath('recent_missing.0.geocoding_status', 'blocked')
            ->assertJsonPath('recent_missing.0.geocoding_reason', 'address_too_short')
            ->assertJsonPath('recent_missing.0.geocoding_reason_label', 'Dirección demasiado corta');
    }

    public function test_can_create_mercado_libre_shipment_without_cod_amount(): void
    {
        $client = Client::create([
            'name' => 'Cliente Mercado Libre',
            'phone' => '310 000 0001',
            'billing_type' => 'post_sale',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Comprador ML',
                'recipient_phone' => '311 111 1112',
                'recipient_address' => 'Cl 101 #20-30',
                'payment_type' => 'mercado_libre',
                'shipping_cost' => 11500,
                'cod_amount' => 85000,
            ]);

        $response->assertCreated()
            ->assertJsonPath('payment_type', 'mercado_libre')
            ->assertJsonPath('cod_amount', 0);

        $this->assertDatabaseHas('shipments', [
            'id' => $response->json('id'),
            'payment_type' => 'mercado_libre',
            'cod_amount' => 0,
        ]);
    }

    public function test_can_create_shipment_with_intake_photo(): void
    {
        Storage::fake('public');

        $client = Client::create([
            'name' => 'Cliente Foto',
            'phone' => '310 000 0002',
            'billing_type' => 'cash_on_delivery',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->post('/api/shipments', [
                'client_id' => $client->id,
                'recipient_name' => 'Cliente con foto',
                'recipient_phone' => '311 111 1113',
                'recipient_address' => 'Cl 102 #20-30',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 11500,
                'cod_amount' => 45000,
                'intake_photo' => UploadedFile::fake()->image('paquete.jpg', 1200, 900)->size(1200),
            ], ['Accept' => 'application/json']);

        $response->assertCreated();

        $assetPath = parse_url((string) $response->json('intake_photo'), PHP_URL_PATH) ?: '';
        $path = ltrim((string) preg_replace('#^/storage/#', '', $assetPath), '/');
        Storage::disk('public')->assertExists($path);
        $this->assertStringStartsWith('/storage/intake/', $assetPath);
    }

    public function test_can_change_shipment_status(): void
    {
        $client = Client::create([
            'name' => 'Test', 'phone' => '310', 'billing_type' => 'cash_on_delivery',
        ]);
        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026051300099',
            'display_code' => '#DHE00099',
            'sequence_number' => 99,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Test', 'recipient_phone' => '311',
            'recipient_address' => 'Cl 1', 'status' => 'registered',
            'payment_type' => 'cash_on_delivery', 'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/status", [
                'status' => 'confirmed',
            ]);

        $response->assertOk()
            ->assertJsonPath('status', 'confirmed');
    }

    public function test_can_delete_registered_shipment_with_delete_method(): void
    {
        $client = Client::create([
            'name' => 'Test', 'phone' => '310', 'billing_type' => 'cash_on_delivery',
        ]);
        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026051300199',
            'display_code' => '#DHE00199',
            'sequence_number' => 199,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Test',
            'recipient_phone' => '311',
            'recipient_address' => 'Cl 1',
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->deleteJson("/api/shipments/{$shipment->id}")
            ->assertOk()
            ->assertJsonStructure(['message']);

        $this->assertSoftDeleted('shipments', ['id' => $shipment->id]);
    }

    public function test_can_delete_registered_shipment_with_post_fallback(): void
    {
        $client = Client::create([
            'name' => 'Test', 'phone' => '310', 'billing_type' => 'cash_on_delivery',
        ]);
        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026051300200',
            'display_code' => '#DHE00200',
            'sequence_number' => 200,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Test',
            'recipient_phone' => '311',
            'recipient_address' => 'Cl 1',
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/delete")
            ->assertOk()
            ->assertJsonStructure(['message']);

        $this->assertSoftDeleted('shipments', ['id' => $shipment->id]);
    }

    public function test_cannot_delete_in_transit_shipment(): void
    {
        $client = Client::create([
            'name' => 'Test', 'phone' => '310', 'billing_type' => 'cash_on_delivery',
        ]);
        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026051300201',
            'display_code' => '#DHE00201',
            'sequence_number' => 201,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Test',
            'recipient_phone' => '311',
            'recipient_address' => 'Cl 1',
            'status' => 'in_transit',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->deleteJson("/api/shipments/{$shipment->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('shipments', ['id' => $shipment->id, 'deleted_at' => null]);
    }

    public function test_invalid_status_transition_returns_error(): void
    {
        $client = Client::create([
            'name' => 'Test', 'phone' => '310', 'billing_type' => 'cash_on_delivery',
        ]);
        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026051300098',
            'display_code' => '#DHE00098',
            'sequence_number' => 98,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Test', 'recipient_phone' => '311',
            'recipient_address' => 'Cl 1', 'status' => 'registered',
            'payment_type' => 'cash_on_delivery', 'shipping_cost' => 10000,
            'financial_status' => 'pending',
        ]);

        // registered → delivered no es válido (debe pasar por confirmed, in_transit, etc.)
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/shipments/{$shipment->id}/status", [
                'status' => 'delivered',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('code', 'invalid_transition');
    }

    public function test_dashboard_returns_kpis(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/dashboard');

        $response->assertOk()
            ->assertJsonStructure([
                'today' => ['total', 'delivered', 'in_transit', 'issue'],
                'financial' => ['cod_pending', 'today_revenue', 'today_profit'],
                'week' => ['total'],
            ]);
    }

    public function test_dashboard_falls_back_to_latest_activity_when_today_has_no_shipments(): void
    {
        $client = Client::create([
            'name' => 'Cliente Dashboard',
            'phone' => '310 000 0099',
            'billing_type' => 'cash_on_delivery',
        ]);

        $yesterday = now()->subDay();

        $shipment = Shipment::create([
            'tracking_code' => 'DHE2026061900010',
            'display_code' => '#DHE90010',
            'sequence_number' => 90010,
            'client_id' => $client->id,
            'created_by' => $this->admin->id,
            'recipient_name' => 'Pedido visible',
            'recipient_phone' => '311 999 0000',
            'recipient_address' => 'Cl 10 #10-10',
            'status' => 'registered',
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 11500,
            'cod_amount' => 23000,
            'financial_status' => 'pending',
            'driver_fee' => 3000,
        ]);

        DB::table('shipments')->where('id', $shipment->id)->update([
            'created_at' => $yesterday,
            'updated_at' => $yesterday,
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/dashboard');

        $response->assertOk()
            ->assertJsonPath('today.total', 1)
            ->assertJsonPath('today.registered', 1)
            ->assertJsonPath('today.scope', 'latest_activity')
            ->assertJsonPath('today.scope_date', $yesterday->toDateString())
            ->assertJsonPath('financial.today_revenue', 11500);
    }

    public function test_public_tracking_finds_shipment(): void
    {
        $this->seed(\Database\Seeders\DemoDataSeeder::class);

        $response = $this->getJson('/api/track?code=DHE00001');

        $response->assertOk()
            ->assertJsonPath('found', true)
            ->assertJsonStructure([
                'shipment' => ['tracking_code', 'status', 'status_label'],
                'timeline',
            ]);
    }

    public function test_public_tracking_returns_404_for_invalid_code(): void
    {
        $response = $this->getJson('/api/track?code=INVALID999');

        $response->assertNotFound()
            ->assertJsonPath('found', false);
    }
}
