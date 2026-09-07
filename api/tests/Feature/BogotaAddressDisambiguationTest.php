<?php

namespace Tests\Feature;

use App\Models\User;
use App\Domain\Shared\Models\Zone;
use App\Domain\Shipment\Services\GeocodingService;
use App\Domain\Shipment\Support\BogotaRoadAliases;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BogotaAddressDisambiguationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        Http::swap(new Factory($this->app->make(\Illuminate\Contracts\Events\Dispatcher::class)));

        // Asegurar zonas mínimas para testing
        Zone::updateOrCreate(['slug' => 'fontibon'], ['name' => 'Fontibón', 'city' => 'Bogotá', 'is_active' => true]);
        Zone::updateOrCreate(['slug' => 'puente-aranda'], ['name' => 'Puente Aranda', 'city' => 'Bogotá', 'is_active' => true]);
        Zone::updateOrCreate(['slug' => 'santa-fe'], ['name' => 'Santa Fe', 'city' => 'Bogotá', 'is_active' => true]);
        Zone::updateOrCreate(['slug' => 'antonio-narino'], ['name' => 'Antonio Nariño', 'city' => 'Bogotá', 'is_active' => true]);
        Zone::updateOrCreate(['slug' => 'chapinero'], ['name' => 'Chapinero', 'city' => 'Bogotá', 'is_active' => true]);
    }

    public function test_bogota_road_aliases_catalog_returns_official_corridors(): void
    {
        $aliasesCll19 = BogotaRoadAliases::getAliasesForAddress('Calle 19 # 10-22');
        $this->assertContains('Avenida Ciudad de Lima', $aliasesCll19);

        $aliasesCra10 = BogotaRoadAliases::getAliasesForAddress('Carrera 10 # 19-22');
        $this->assertContains('Avenida Fernando Mazuera', $aliasesCra10);

        $aliasesCll26 = BogotaRoadAliases::getAliasesForAddress('Calle 26 # 68-00');
        $this->assertContains('Avenida El Dorado', $aliasesCll26);

        $this->assertTrue(BogotaRoadAliases::areRoadsEquivalent('Calle 19', 'Avenida Ciudad de Lima'));
        $this->assertTrue(BogotaRoadAliases::areRoadsEquivalent('Carrera 10', 'Avenida Fernando Mazuera'));
        $this->assertFalse(BogotaRoadAliases::areRoadsEquivalent('Calle 19', 'Calle 19 Sur'));
    }

    public function test_directional_filter_rejects_sur_when_address_does_not_have_sur(): void
    {
        config()->set('services.google.maps_key', null);

        // Nominatim devuelve 1 candidato Calle 19 Sur y 1 candidato Calle 19 Norte/Centro
        Http::fake([
            'https://nominatim.openstreetmap.org/search*' => Http::response([
                [
                    'lat' => '4.5700',
                    'lon' => '-74.1200',
                    'name' => 'Calle 19 Sur',
                    'display_name' => 'Calle 19 Sur, Antonio Nariño, Bogotá, Colombia',
                    'address' => [
                        'road' => 'Calle 19 Sur',
                        'city_district' => 'Antonio Nariño',
                        'city' => 'Bogotá',
                    ],
                ],
                [
                    'lat' => '4.6700',
                    'lon' => '-74.1400',
                    'name' => 'Calle 19',
                    'display_name' => 'Calle 19, Fontibón, Bogotá, Colombia',
                    'address' => [
                        'road' => 'Calle 19',
                        'city_district' => 'Fontibón',
                        'city' => 'Bogotá',
                    ],
                ],
            ], 200),
        ]);

        $result = app(GeocodingService::class)->geocode('Calle 19 # 10 22', 'Bogotá');

        // El candidato 'Calle 19 Sur' debió ser descartado por la regla direccional.
        // Solo sobrevive 'Fontibón', que al ser 1 sola localidad resulta aproximado
        $this->assertNotNull($result);
        $this->assertSame('Fontibón', $result['matched_zone']);
        $this->assertSame(GeocodingService::CONFIDENCE_APPROXIMATE, $result['confidence']);
    }

    public function test_directional_filter_enforces_sur_when_address_explicitly_has_sur(): void
    {
        config()->set('services.google.maps_key', null);

        Http::fake([
            'https://nominatim.openstreetmap.org/search*' => Http::response([
                [
                    'lat' => '4.6700',
                    'lon' => '-74.1400',
                    'name' => 'Calle 19',
                    'display_name' => 'Calle 19, Fontibón, Bogotá, Colombia',
                    'address' => [
                        'road' => 'Calle 19',
                        'city_district' => 'Fontibón',
                        'city' => 'Bogotá',
                    ],
                ],
                [
                    'lat' => '4.5700',
                    'lon' => '-74.1200',
                    'name' => 'Calle 19 Sur',
                    'display_name' => 'Calle 19 Sur, Antonio Nariño, Bogotá, Colombia',
                    'address' => [
                        'road' => 'Calle 19 Sur',
                        'city_district' => 'Antonio Nariño',
                        'city' => 'Bogotá',
                    ],
                ],
            ], 200),
        ]);

        $result = app(GeocodingService::class)->geocode('Calle 19 Sur # 10 22', 'Bogotá');

        $this->assertNotNull($result);
        $this->assertSame('Antonio Nariño', $result['matched_zone']);
    }

    public function test_ambiguous_result_when_candidates_span_multiple_localities(): void
    {
        config()->set('services.google.maps_key', null);

        Http::fake([
            'https://nominatim.openstreetmap.org/search*' => Http::response([
                [
                    'lat' => '4.6700',
                    'lon' => '-74.1400',
                    'name' => 'Calle 19',
                    'display_name' => 'Calle 19, Fontibón, Bogotá, Colombia',
                    'address' => [
                        'road' => 'Calle 19',
                        'city_district' => 'Fontibón',
                        'city' => 'Bogotá',
                    ],
                ],
                [
                    'lat' => '4.6300',
                    'lon' => '-74.1100',
                    'name' => 'Calle 19',
                    'display_name' => 'Calle 19, Puente Aranda, Bogotá, Colombia',
                    'address' => [
                        'road' => 'Calle 19',
                        'city_district' => 'Puente Aranda',
                        'city' => 'Bogotá',
                    ],
                ],
            ], 200),
        ]);

        $result = app(GeocodingService::class)->geocode('Calle 19 # 10 22', 'Bogotá');

        $this->assertNotNull($result);
        $this->assertSame(GeocodingService::CONFIDENCE_AMBIGUOUS, $result['confidence']);
        $this->assertNull($result['matched_zone']);
        $this->assertContains('Fontibón', $result['ambiguous_zones']);
        $this->assertContains('Puente Aranda', $result['ambiguous_zones']);
    }

    public function test_detect_location_api_endpoint_returns_ambiguous_without_selecting_zone(): void
    {
        config()->set('services.google.maps_key', null);

        $admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();

        Http::fake([
            'https://nominatim.openstreetmap.org/search*' => Http::response([
                [
                    'lat' => '4.6700',
                    'lon' => '-74.1400',
                    'name' => 'Calle 19',
                    'display_name' => 'Calle 19, Fontibón, Bogotá, Colombia',
                    'address' => [
                        'road' => 'Calle 19',
                        'city_district' => 'Fontibón',
                        'city' => 'Bogotá',
                    ],
                ],
                [
                    'lat' => '4.6300',
                    'lon' => '-74.1100',
                    'name' => 'Calle 19',
                    'display_name' => 'Calle 19, Puente Aranda, Bogotá, Colombia',
                    'address' => [
                        'road' => 'Calle 19',
                        'city_district' => 'Puente Aranda',
                        'city' => 'Bogotá',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->actingAs($admin)->postJson('/api/shipments/detect-location', [
            'address' => 'Calle 19 # 10 22',
            'city' => 'Bogotá',
        ]);

        $response->assertOk();
        $response->assertJson([
            'detected_zone' => null,
            'is_real' => false,
            'confidence' => 'ambiguo',
        ]);
        $this->assertCount(2, $response->json('ambiguous_zones'));
    }
}
