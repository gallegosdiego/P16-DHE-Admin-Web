<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Shared\Models\Zone;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Services\GeographicCoherenceService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * OT-A: Batería de pruebas automatizadas para Confianza Geográfica.
 * Cubre:
 * 1. Idempotencia de la migración de siembra de cajas de zona.
 * 2. No sobreescritura de valores manuales preexistentes.
 * 3. Resultados de GeographicCoherenceService (coherente, fuera_de_zona, sin_datos).
 * 4. Scope Shipment::needsLocationReview() cubriendo cada criterio de revisión.
 * 5. Endpoint GET /api/shipments/geo-summary exponiendo el conteo de revisión.
 */
class GeographicConfidenceTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Client $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();

        $this->client = Client::create([
            'name' => 'Cliente Pruebas Geo',
            'phone' => '310 000 7777',
            'billing_type' => 'cash_on_delivery',
        ]);
    }

    /**
     * Prueba 1: Idempotencia de la migración. Correr la migración dos veces produce el mismo estado.
     */
    public function test_migration_is_idempotent_and_seeds_expected_bounding_boxes(): void
    {
        $usaquen = Zone::where('slug', 'usaquen')->firstOrFail();
        $this->assertNotNull($usaquen->lat_min);
        $this->assertNotNull($usaquen->lat_max);
        $this->assertNotNull($usaquen->lng_min);
        $this->assertNotNull($usaquen->lng_max);

        $this->assertEqualsWithDelta(4.6634583, $usaquen->lat_min, 0.0001);
        $this->assertEqualsWithDelta(4.8256021, $usaquen->lat_max, 0.0001);

        $soacha = Zone::where('slug', 'soacha')->firstOrFail();
        $this->assertEqualsWithDelta(4.3797185, $soacha->lat_min, 0.0001);
        $this->assertEqualsWithDelta(4.6344346, $soacha->lat_max, 0.0001);

        // Guardar snapshot de las 27 zonas
        $firstRun = Zone::select('slug', 'lat_min', 'lat_max', 'lng_min', 'lng_max')
            ->orderBy('slug')
            ->get()
            ->toArray();

        // Ejecutar nuevamente la migración up()
        $migration = require database_path('migrations/2026_09_07_100000_seed_zone_bounding_boxes.php');
        $migration->up();

        $secondRun = Zone::select('slug', 'lat_min', 'lat_max', 'lng_min', 'lng_max')
            ->orderBy('slug')
            ->get()
            ->toArray();

        $this->assertSame($firstRun, $secondRun);
    }

    /**
     * Prueba 2: No sobreescribir valores manuales preexistentes.
     */
    public function test_migration_preserves_manually_configured_bounding_boxes(): void
    {
        // Forzar un valor manual personalizado en una zona
        $suba = Zone::where('slug', 'suba')->firstOrFail();
        $customLatMin = 4.7000000;
        $customLatMax = 4.8000000;
        $customLngMin = -74.1200000;
        $customLngMax = -74.0500000;

        $suba->update([
            'lat_min' => $customLatMin,
            'lat_max' => $customLatMax,
            'lng_min' => $customLngMin,
            'lng_max' => $customLngMax,
        ]);

        // Correr la migración
        $migration = require database_path('migrations/2026_09_07_100000_seed_zone_bounding_boxes.php');
        $migration->up();

        $suba->refresh();
        $this->assertEqualsWithDelta($customLatMin, $suba->lat_min, 0.000001);
        $this->assertEqualsWithDelta($customLatMax, $suba->lat_max, 0.000001);
        $this->assertEqualsWithDelta($customLngMin, $suba->lng_min, 0.000001);
        $this->assertEqualsWithDelta($customLngMax, $suba->lng_max, 0.000001);
    }

    /**
     * Prueba 3: GeographicCoherenceService devuelve los 3 resultados esperados sin efectos secundarios.
     */
    public function test_geographic_coherence_service_outcomes(): void
    {
        $service = new GeographicCoherenceService();

        // Caso 1: Coherente (Punto en Chapinero: Calle 60 con Carrera 7)
        $res1 = $service->checkCoordinates(4.6489, -74.0645, 'Chapinero');
        $this->assertSame(GeographicCoherenceService::STATUS_COHERENTE, $res1['status']);
        $this->assertNull($res1['reason']);

        // Caso 2: Fuera de zona (Coordenadas de Chapinero asignadas a Suba)
        $res2 = $service->checkCoordinates(4.6489, -74.0645, 'Suba');
        $this->assertSame(GeographicCoherenceService::STATUS_FUERA_DE_ZONA, $res2['status']);
        $this->assertSame('coordinates_outside_zone_bounds', $res2['reason']);

        // Caso 3: Sin datos (coordenadas nulas)
        $res3 = $service->checkCoordinates(null, null, 'Chapinero');
        $this->assertSame(GeographicCoherenceService::STATUS_SIN_DATOS, $res3['status']);
        $this->assertSame('missing_coordinates', $res3['reason']);

        // Caso 4: Sin datos (zona vacía)
        $res4 = $service->checkCoordinates(4.6489, -74.0645, '');
        $this->assertSame(GeographicCoherenceService::STATUS_SIN_DATOS, $res4['status']);
        $this->assertSame('missing_zone', $res4['reason']);

        // Caso 5: Sin datos (zona desconocida)
        $res5 = $service->checkCoordinates(4.6489, -74.0645, 'Zona Fantasma');
        $this->assertSame(GeographicCoherenceService::STATUS_SIN_DATOS, $res5['status']);
        $this->assertSame('zone_not_found', $res5['reason']);
    }

    /**
     * Prueba 4: Scope needsLocationReview() y desglose de motivos.
     */
    public function test_needs_location_review_scope_and_reasons(): void
    {
        $chapinero = Zone::where('slug', 'chapinero')->firstOrFail();
        $centroid = $chapinero->centroid();

        // 1. Envío coherente (no debe entrar en revisión)
        $okShipment = $this->createShipment([
            'tracking_code' => 'DHE-OK-01',
            'recipient_zone' => 'Chapinero',
            'recipient_lat' => 4.6489,
            'recipient_lng' => -74.0645,
        ]);

        // 2. Envío sin coordenadas
        $noCoordsShipment = $this->createShipment([
            'tracking_code' => 'DHE-NOCOORDS-01',
            'recipient_zone' => 'Chapinero',
            'recipient_lat' => null,
            'recipient_lng' => null,
        ]);

        // 3. Envío sin zona
        $noZoneShipment = $this->createShipment([
            'tracking_code' => 'DHE-NOZONE-01',
            'recipient_zone' => null,
            'recipient_lat' => 4.6489,
            'recipient_lng' => -74.0645,
        ]);

        // 4. Envío con coordenadas fuera de zona (coordenadas de Chapinero en Bosa)
        $outOfZoneShipment = $this->createShipment([
            'tracking_code' => 'DHE-OUTOFZONE-01',
            'recipient_zone' => 'Bosa',
            'recipient_lat' => 4.6489,
            'recipient_lng' => -74.0645,
        ]);

        // 5. Envío con coordenadas de centroide aproximado
        $centroidShipment = $this->createShipment([
            'tracking_code' => 'DHE-CENTROID-01',
            'recipient_zone' => 'Chapinero',
            'recipient_lat' => $centroid['lat'],
            'recipient_lng' => $centroid['lng'],
        ]);

        // Verificar resultados del scope en BD
        $reviewShipmentIds = Shipment::query()->needsLocationReview()->pluck('id')->all();

        $this->assertNotContains($okShipment->id, $reviewShipmentIds);
        $this->assertContains($noCoordsShipment->id, $reviewShipmentIds);
        $this->assertContains($noZoneShipment->id, $reviewShipmentIds);
        $this->assertContains($outOfZoneShipment->id, $reviewShipmentIds);
        $this->assertContains($centroidShipment->id, $reviewShipmentIds);

        // Verificar desglose de motivos
        $this->assertContains('sin_coordenadas', $noCoordsShipment->locationReviewReasons());
        $this->assertContains('sin_zona', $noZoneShipment->locationReviewReasons());
        $this->assertContains('incoherente_con_zona', $outOfZoneShipment->locationReviewReasons());
        $this->assertContains('geocodificacion_aproximada', $centroidShipment->locationReviewReasons());
    }

    /**
     * Prueba 5: GET /api/shipments/geo-summary incluye el conteo needs_location_review.
     */
    public function test_geo_summary_endpoint_includes_needs_location_review_count(): void
    {
        // Crear 1 envío coherente y 2 envíos que necesitan revisión
        $this->createShipment([
            'tracking_code' => 'DHE-GEO-SUMM-1',
            'recipient_zone' => 'Chapinero',
            'recipient_lat' => 4.6489,
            'recipient_lng' => -74.0645,
        ]);

        $this->createShipment([
            'tracking_code' => 'DHE-GEO-SUMM-2',
            'recipient_zone' => 'Chapinero',
            'recipient_lat' => null,
            'recipient_lng' => null,
        ]);

        $this->createShipment([
            'tracking_code' => 'DHE-GEO-SUMM-3',
            'recipient_zone' => 'Suba',
            'recipient_lat' => 4.6489,
            'recipient_lng' => -74.0645, // Fuera de Suba
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/shipments/geo-summary');

        $response->assertOk()
            ->assertJsonPath('summary.total', 3)
            ->assertJsonPath('summary.with_coordinates', 2)
            ->assertJsonPath('summary.without_coordinates', 1)
            ->assertJsonPath('summary.needs_location_review', 2);
    }

    private function createShipment(array $overrides = []): Shipment
    {
        static $seq = 90000;
        $seq++;

        return Shipment::withoutEvents(function () use ($overrides, $seq) {
            return Shipment::create(array_merge([
                'tracking_code' => 'DHE' . $seq,
                'display_code' => '#DHE' . $seq,
                'sequence_number' => $seq,
                'client_id' => $this->client->id,
                'created_by' => $this->admin->id,
                'recipient_name' => 'Destinatario ' . $seq,
                'recipient_phone' => '3000000000',
                'recipient_address' => 'Cl 50 #10-10',
                'recipient_city' => 'Bogota',
                'recipient_zone' => 'Chapinero',
                'recipient_lat' => 4.6489,
                'recipient_lng' => -74.0645,
                'status' => 'registered',
                'payment_type' => 'cash_on_delivery',
                'shipping_cost' => 10000,
                'financial_status' => 'pending',
                'geocoded_at' => now(),
            ], $overrides));
        });
    }
}
