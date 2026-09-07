<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * OT-A: Siembra de cajas geográficas (bounding boxes) para las 27 zonas oficiales
 * de cobertura (19 localidades urbanas de Bogotá y 8 municipios aledaños).
 *
 * Coordenadas oficiales obtenidas de relaciones administrativas de OpenStreetMap / Nominatim:
 * - Localidades de Bogotá: límites administrativos oficiales distritales.
 * - Municipios de Cundinamarca: límites administrativos municipales completos.
 *
 * Reglas de aplicación:
 * - Aditiva: Solo actualiza registros existentes cuyo cuarteto de coordenadas esté completamente vacío (NULL).
 * - No destructiva: Si alguna columna ya tiene valor (edición manual previa), no se sobreescribe.
 * - No crea, no elimina ni desactiva zonas.
 * - Idempotente: Correrla múltiples veces produce exactamente el mismo estado sin alterar nada.
 */
return new class extends Migration
{
    /**
     * Bounding boxes oficiales por slug [lat_min, lat_max, lng_min, lng_max].
     */
    private const ZONE_BOUNDS = [
        // 19 Localidades urbanas de Bogotá
        'usaquen'            => [4.6634583, 4.8256021, -74.0571828, -73.9993946],
        'chapinero'          => [4.6126093, 4.6869388, -74.0683599, -73.9859033],
        'santa-fe'           => [4.5586950, 4.6288107, -74.0889975, -73.9939123],
        'san-cristobal'      => [4.5088665, 4.5893396, -74.1061912, -74.0274399],
        'usme'               => [4.2675775, 4.5460622, -74.2239976, -74.0560189],
        'tunjuelito'         => [4.5443885, 4.5957516, -74.1570310, -74.1209497],
        'bosa'               => [4.5957151, 4.6550100, -74.2235137, -74.1521390],
        'kennedy'            => [4.5950074, 4.6642060, -74.1857583, -74.1182906],
        'fontibon'           => [4.6373655, 4.7174430, -74.1768712, -74.1034380],
        'engativa'           => [4.6536408, 4.7400513, -74.1603998, -74.0772936],
        'suba'               => [4.6853655, 4.8369805, -74.1319174, -74.0345040],
        'barrios-unidos'     => [4.6496094, 4.6896866, -74.0933736, -74.0571828],
        'teusaquillo'        => [4.6154416, 4.6661092, -74.1104360, -74.0646404],
        'los-martires'       => [4.5918942, 4.6247285, -74.1070438, -74.0728152],
        'antonio-narino'     => [4.5757791, 4.5984321, -74.1315283, -74.0848833],
        'puente-aranda'      => [4.5935759, 4.6451602, -74.1377987, -74.0831501],
        'la-candelaria'      => [4.5892390, 4.6034732, -74.0829210, -74.0591553],
        'rafael-uribe-uribe' => [4.5327239, 4.5926156, -74.1308624, -74.0945836],
        'ciudad-bolivar'     => [4.3835751, 4.5997616, -74.2135048, -74.1199816],

        // 8 Municipios aledaños de Cundinamarca
        'soacha'             => [4.3797185, 4.6344346, -74.3092414, -74.1737330],
        'madrid'             => [4.6801375, 4.8596110, -74.3287080, -74.1727599],
        'mosquera'           => [4.6186349, 4.7370333, -74.3007671, -74.1568357],
        'funza'              => [4.6961688, 4.7975870, -74.2461321, -74.1484681],
        'cota'               => [4.7225867, 4.8490198, -74.1638922, -74.0775608],
        'cajica'             => [4.8833973, 4.9880203, -74.0705049, -73.9950201],
        'chia'               => [4.8207227, 4.9179233, -74.0942989, -73.9813373],
        'zipaquira'          => [4.9610666, 5.1624564, -74.0944890, -73.9056229],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('zones')) {
            return;
        }

        foreach (self::ZONE_BOUNDS as $slug => [$latMin, $latMax, $lngMin, $lngMax]) {
            // Solo actualizar si las 4 coordenadas son NULL (no pisar modificaciones manuales)
            DB::table('zones')
                ->where('slug', $slug)
                ->whereNull('lat_min')
                ->whereNull('lat_max')
                ->whereNull('lng_min')
                ->whereNull('lng_max')
                ->update([
                    'lat_min'    => $latMin,
                    'lat_max'    => $latMax,
                    'lng_min'    => $lngMin,
                    'lng_max'    => $lngMax,
                    'updated_at' => now(),
                ]);
        }
    }

    public function down(): void
    {
        // Sin reversa destructiva para no eliminar posibles ajustes manuales posteriores.
    }
};
