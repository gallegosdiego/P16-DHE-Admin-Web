<?php

namespace Tests\Feature;

use App\Domain\Shared\Models\Zone;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DetectLocationApiTest extends TestCase
{
    use RefreshDatabase;

    private string $token;
    private int $userId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        Http::swap(new Factory($this->app->make(\Illuminate\Contracts\Events\Dispatcher::class)));

        $user = User::query()->where('email', 'admin@danheiexpress.com')->firstOrFail();
        $this->userId = $user->id;

        $response = $this->postJson('/api/login', [
            'email' => 'admin@danheiexpress.com',
            'password' => 'DanheiAdmin2026!',
        ]);

        $this->token = (string) $response->json('token');
    }

    public function test_detect_location_for_loose_address_with_google(): void
    {
        config(['services.google.maps_key' => 'test-fake-key']);

        Http::fake([
            'https://maps.googleapis.com/maps/api/geocode/json*' => Http::response([
                'status' => 'OK',
                'results' => [
                    [
                        'formatted_address' => 'Calle 100 # 15-20, Bogotá, Colombia',
                        'geometry' => [
                            'location' => [
                                'lat' => 4.6851114,
                                'lng' => -74.0490708,
                            ],
                        ],
                        'address_components' => [
                            [
                                'long_name' => 'Bogotá',
                                'types' => ['locality', 'political'],
                            ],
                            [
                                'long_name' => 'Chapinero',
                                'types' => ['sublocality_level_1', 'sublocality', 'political'],
                            ],
                            [
                                'long_name' => 'San Patricio',
                                'types' => ['neighborhood', 'political'],
                            ],
                        ],
                    ],
                ],
            ]),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $this->token)
            ->postJson('/api/shipments/detect-location', [
                'address' => 'Calle 100 # 15-20',
                'city' => 'Bogota',
            ]);

        $response->assertOk()
            ->assertJsonPath('address', 'Calle 100 # 15-20')
            ->assertJsonPath('detected_zone', 'Chapinero')
            ->assertJsonPath('locality', 'Chapinero')
            ->assertJsonPath('neighborhood', 'San Patricio')
            ->assertJsonPath('is_real', true);
    }

    public function test_detect_location_with_nominatim_fallback(): void
    {
        config(['services.google.maps_key' => null]);

        Http::fake([
            'https://nominatim.openstreetmap.org/search*' => Http::response([
                [
                    'lat' => '4.759486',
                    'lon' => '-74.064099',
                    'display_name' => 'Calle 170 # 60-20, Suba, Bogotá, Colombia',
                    'address' => [
                        'city' => 'Bogotá',
                        'suburb' => 'Localidad Suba',
                        'neighbourhood' => 'San Felipe',
                    ],
                ],
            ]),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $this->token)
            ->postJson('/api/shipments/detect-location', [
                'address' => 'Calle 170 # 60-20',
                'city' => 'Bogota',
            ]);

        $response->assertOk()
            ->assertJsonPath('detected_zone', 'Suba')
            ->assertJsonPath('is_real', true);
    }

    public function test_detect_shipment_location_suggest_mode(): void
    {
        config(['services.google.maps_key' => 'test-fake-key']);

        Http::fake([
            'https://maps.googleapis.com/maps/api/geocode/json*' => Http::response([
                'status' => 'OK',
                'results' => [
                    [
                        'formatted_address' => 'Carrera 7 # 26-20, Bogotá, Colombia',
                        'geometry' => [
                            'location' => [
                                'lat' => 4.6124417,
                                'lng' => -74.0694178,
                            ],
                        ],
                        'address_components' => [
                            [
                                'long_name' => 'Bogotá',
                                'types' => ['locality', 'political'],
                            ],
                            [
                                'long_name' => 'Santa Fé',
                                'types' => ['sublocality_level_1', 'sublocality', 'political'],
                            ],
                        ],
                    ],
                ],
            ]),
        ]);

        $shipment = Shipment::query()->create([
            'sequence_number' => 1001,
            'display_code' => 'DHE00091',
            'tracking_code' => 'DHE-TEST-001',
            'status' => 'registered',
            'recipient_name' => 'Test User',
            'recipient_phone' => '3001234567',
            'recipient_address' => 'Carrera 7 # 26-20',
            'recipient_city' => 'Bogota',
            'recipient_zone' => null,
            'payment_type' => 'cash_on_delivery',
            'shipping_cost' => 12000,
            'cod_amount' => 50000,
            'created_by' => $this->userId,
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $this->token)
            ->postJson("/api/shipments/{$shipment->id}/detect-location", [
                'mode' => 'suggest',
            ]);

        $response->assertOk()
            ->assertJsonPath('shipment_id', $shipment->id)
            ->assertJsonPath('detected_zone', 'Santa Fe');

        $this->assertNull($shipment->fresh()->recipient_zone);
    }

    public function test_detect_shipment_location_apply_mode(): void
    {
        config(['services.google.maps_key' => 'test-fake-key']);

        Http::fake([
            'https://maps.googleapis.com/maps/api/geocode/json*' => Http::response([
                'status' => 'OK',
                'results' => [
                    [
                        'formatted_address' => 'Calle 170 # 60-20, Bogotá, Colombia',
                        'geometry' => [
                            'location' => [
                                'lat' => 4.759486,
                                'lng' => -74.064099,
                            ],
                        ],
                        'address_components' => [
                            [
                                'long_name' => 'Bogotá',
                                'types' => ['locality', 'political'],
                            ],
                            [
                                'long_name' => 'Suba',
                                'types' => ['sublocality_level_1', 'sublocality', 'political'],
                            ],
                        ],
                    ],
                ],
            ]),
        ]);

        $shipment = Shipment::query()->create([
            'sequence_number' => 1002,
            'display_code' => 'DHE00092',
            'tracking_code' => 'DHE-TEST-002',
            'status' => 'registered',
            'recipient_name' => 'Test User 2',
            'recipient_phone' => '3001234567',
            'recipient_address' => 'Calle 170 # 60-20',
            'recipient_city' => 'Bogota',
            'recipient_zone' => null,
            'payment_type' => 'prepaid',
            'shipping_cost' => 12000,
            'cod_amount' => 0,
            'created_by' => $this->userId,
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $this->token)
            ->postJson("/api/shipments/{$shipment->id}/detect-location", [
                'mode' => 'apply',
            ]);

        $response->assertOk()
            ->assertJsonPath('detected_zone', 'Suba');

        $this->assertSame('Suba', $shipment->fresh()->recipient_zone);
        $this->assertEqualsWithDelta(4.759486, $shipment->fresh()->recipient_lat, 0.0001);
        $this->assertEqualsWithDelta(-74.064099, $shipment->fresh()->recipient_lng, 0.0001);
    }
}