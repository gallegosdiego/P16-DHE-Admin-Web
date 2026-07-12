<?php

namespace Tests\Feature;

use App\Domain\Shipment\Services\GeocodingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GeocodingServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Estas pruebas definen su propio contrato HTTP, sin heredar la
        // protección global contra llamadas de red de TestCase.
        Http::swap(new Factory($this->app->make(\Illuminate\Contracts\Events\Dispatcher::class)));
    }

    public function test_geocoder_falls_back_to_nominatim_when_google_key_is_missing(): void
    {
        config()->set('services.google.maps_key', null);

        Http::fake([
            'https://nominatim.openstreetmap.org/search*' => Http::response([
                [
                    'lat' => '4.7110000',
                    'lon' => '-74.0721000',
                ],
            ], 200),
        ]);

        $result = app(GeocodingService::class)->geocode('Calle 22 #14-05', 'Bogota');

        $this->assertSame([
            'lat' => 4.711,
            'lng' => -74.0721,
        ], $result);
    }

    public function test_geocoder_falls_back_to_nominatim_when_google_returns_no_results(): void
    {
        config()->set('services.google.maps_key', 'fake-key');

        Http::fake([
            'https://maps.googleapis.com/maps/api/geocode/json*' => Http::response([
                'status' => 'ZERO_RESULTS',
                'results' => [],
            ], 200),
            'https://nominatim.openstreetmap.org/search*' => Http::response([
                [
                    'lat' => '4.6533000',
                    'lon' => '-74.0631000',
                ],
            ], 200),
        ]);

        $result = app(GeocodingService::class)->geocode('Cra 13 #58-10', 'Bogota');

        $this->assertSame([
            'lat' => 4.6533,
            'lng' => -74.0631,
        ], $result);
    }

    public function test_geocoder_tries_zone_context_before_plain_city_query(): void
    {
        config()->set('services.google.maps_key', null);

        Http::fake([
            'https://nominatim.openstreetmap.org/search*' => function ($request) {
                $query = $request->data()['q'] ?? '';

                if (str_contains($query, 'Chapinero')) {
                    return Http::response([
                        [
                            'lat' => '4.6486000',
                            'lon' => '-74.0627000',
                        ],
                    ], 200);
                }

                return Http::response([], 200);
            },
        ]);

        $result = app(GeocodingService::class)->geocode('Calle 22 #14-05', 'Bogota', 'Chapinero');

        $this->assertSame([
            'lat' => 4.6486,
            'lng' => -74.0627,
        ], $result);
    }

    public function test_geocoder_normalizes_duplicate_zone_and_city_context_inside_address(): void
    {
        config()->set('services.google.maps_key', null);

        $queries = [];

        Http::fake([
            'https://nominatim.openstreetmap.org/search*' => function ($request) use (&$queries) {
                $queries[] = $request->data()['q'] ?? '';

                return Http::response([
                    [
                        'lat' => '4.7110000',
                        'lon' => '-74.0721000',
                    ],
                ], 200);
            },
        ]);

        $result = app(GeocodingService::class)->geocode(
            'calle 22 #14-05, chapinero, bogotá',
            'Bogotá',
            'chapinero'
        );

        $this->assertSame([
            'lat' => 4.711,
            'lng' => -74.0721,
        ], $result);
        $this->assertSame('Calle 22 # 14-05, Chapinero, Bogota, Colombia', $queries[0] ?? null);
    }

    public function test_geocoder_retries_without_secondary_address_details(): void
    {
        config()->set('services.google.maps_key', null);

        Http::fake([
            'https://nominatim.openstreetmap.org/search*' => function ($request) {
                $query = $request->data()['q'] ?? '';

                if ($query === 'Calle 22 # 14-05, Bogota, Colombia') {
                    return Http::response([
                        [
                            'lat' => '4.6501000',
                            'lon' => '-74.0605000',
                        ],
                    ], 200);
                }

                return Http::response([], 200);
            },
        ]);

        $result = app(GeocodingService::class)->geocode(
            'Calle 22 #14-05 apartamento 201',
            'Bogota'
        );

        $this->assertSame([
            'lat' => 4.6501,
            'lng' => -74.0605,
        ], $result);
    }

    public function test_geocoder_can_infer_zone_and_city_when_they_are_embedded_in_address(): void
    {
        config()->set('services.google.maps_key', null);

        $queries = [];

        Http::fake([
            'https://nominatim.openstreetmap.org/search*' => function ($request) use (&$queries) {
                $query = $request->data()['q'] ?? '';
                $queries[] = $query;

                if (str_contains($query, 'Bosa, Bogota')) {
                    return Http::response([
                        [
                            'lat' => '4.6175000',
                            'lon' => '-74.1861000',
                        ],
                    ], 200);
                }

                return Http::response([], 200);
            },
        ]);

        $result = app(GeocodingService::class)->geocode('Calle 135 #103F 64, Bosa, Bogota', '');

        $this->assertSame([
            'lat' => 4.6175,
            'lng' => -74.1861,
        ], $result);
        $this->assertContains('Calle 135 # 103F-64, Bosa, Bogota, Colombia', $queries);
    }

    public function test_normalizer_does_not_treat_single_segment_address_as_city_context(): void
    {
        $normalized = app(GeocodingService::class)->normalizeLocationInput('Direccion ambigua', null, 'Chapinero');

        $this->assertSame([
            'address' => 'Direccion Ambigua',
            'city' => null,
            'zone' => 'Chapinero',
        ], $normalized);
    }
}
