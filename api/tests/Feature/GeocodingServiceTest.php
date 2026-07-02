<?php

namespace Tests\Feature;

use App\Domain\Shipment\Services\GeocodingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GeocodingServiceTest extends TestCase
{
    use RefreshDatabase;

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
}
