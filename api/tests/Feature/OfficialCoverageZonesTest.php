<?php

namespace Tests\Feature;

use App\Domain\Shared\Models\Zone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * El catalogo de zonas debe reflejar la cobertura oficial documentada:
 * 19 localidades urbanas de Bogota (sin Sumapaz) y 8 municipios de
 * alrededores. El selector del ingreso y la ciudad de cada guia dependen
 * de este catalogo.
 */
class OfficialCoverageZonesTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_nineteen_localidades_exist_as_active_bogota_zones(): void
    {
        $localidades = [
            'usaquen', 'chapinero', 'santa-fe', 'san-cristobal', 'usme',
            'tunjuelito', 'bosa', 'kennedy', 'fontibon', 'engativa',
            'suba', 'barrios-unidos', 'teusaquillo', 'los-martires',
            'antonio-narino', 'puente-aranda', 'la-candelaria',
            'rafael-uribe-uribe', 'ciudad-bolivar',
        ];

        $this->assertCount(19, $localidades);

        foreach ($localidades as $slug) {
            $zone = Zone::query()->where('slug', $slug)->first();
            $this->assertNotNull($zone, "Falta la localidad {$slug}");
            $this->assertSame('Bogotá', $zone->city, "{$slug} debe pertenecer a Bogotá");
            $this->assertTrue((bool) $zone->is_active, "{$slug} debe estar activa");
        }
    }

    public function test_the_eight_surrounding_municipios_carry_their_own_city(): void
    {
        $municipios = [
            'soacha' => 'Soacha',
            'madrid' => 'Madrid',
            'mosquera' => 'Mosquera',
            'funza' => 'Funza',
            'cota' => 'Cota',
            'cajica' => 'Cajicá',
            'chia' => 'Chía',
            'zipaquira' => 'Zipaquirá',
        ];

        foreach ($municipios as $slug => $city) {
            $zone = Zone::query()->where('slug', $slug)->first();
            $this->assertNotNull($zone, "Falta el municipio {$slug}");
            // La ciudad propia es lo que permite que elegir la zona saque la
            // guia de Bogota SOLO hacia donde si entregamos.
            $this->assertSame($city, $zone->city, "{$slug} debe declarar su propia ciudad");
        }
    }

    public function test_sumapaz_is_deliberately_absent(): void
    {
        $this->assertNull(
            Zone::query()->where('slug', 'sumapaz')->first(),
            'Sumapaz esta excluida de la operacion comercial por el documento de cobertura.',
        );
    }
}
