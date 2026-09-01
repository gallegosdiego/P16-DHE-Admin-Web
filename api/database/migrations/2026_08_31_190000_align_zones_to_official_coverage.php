<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Alinea el catalogo de zonas con la cobertura OFICIAL documentada
 * (P17: cobertura-danhei.md, 2026-06-10, y la landing publica): las 19
 * localidades urbanas de Bogota (Sumapaz excluida a proposito) y los 8
 * municipios de alrededores. El selector de zona del ingreso se alimenta
 * de este catalogo, y desde el 31/08 la zona decide la ciudad de la guia:
 * un catalogo incompleto significa sectores que no se pueden elegir.
 *
 * Idempotente y conservadora: crea lo que falta, completa la ciudad y el
 * tipo SOLO donde estan vacios o en el default generico, y jamas borra,
 * renombra ni desactiva zonas existentes — las creadas a mano en /zonas
 * son datos reales del negocio. No crea tarifas: el precio es una
 * decision comercial que se toma en /zonas, no en una migracion.
 */
return new class extends Migration
{
    private const LOCALIDADES = [
        'Usaquén', 'Chapinero', 'Santa Fe', 'San Cristóbal', 'Usme',
        'Tunjuelito', 'Bosa', 'Kennedy', 'Fontibón', 'Engativá',
        'Suba', 'Barrios Unidos', 'Teusaquillo', 'Los Mártires',
        'Antonio Nariño', 'Puente Aranda', 'La Candelaria',
        'Rafael Uribe Uribe', 'Ciudad Bolívar',
    ];

    private const ALREDEDORES = [
        // [nombre, tipo] — Zipaquira es la mas lejana, como en la demo.
        ['Soacha', 'suburban'],
        ['Madrid', 'suburban'],
        ['Mosquera', 'suburban'],
        ['Funza', 'suburban'],
        ['Cota', 'suburban'],
        ['Cajicá', 'suburban'],
        ['Chía', 'suburban'],
        ['Zipaquirá', 'extended'],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('zones')) {
            return;
        }

        $now = now();
        $sort = 1;

        foreach (self::LOCALIDADES as $name) {
            $this->upsertZone($name, 'Bogotá', 'urban', $sort++, $now);
        }

        foreach (self::ALREDEDORES as [$name, $type]) {
            $this->upsertZone($name, $name, $type, $sort++, $now);
        }
    }

    public function down(): void
    {
        // Sin reversa: quitar zonas podria dejar guias apuntando a sectores
        // inexistentes. Depurar el catalogo es trabajo de /zonas, a mano.
    }

    private function upsertZone(string $name, string $city, string $type, int $sortOrder, $now): void
    {
        $slug = Str::slug($name);
        $existing = DB::table('zones')->where('slug', $slug)->first();

        if ($existing === null) {
            DB::table('zones')->insert([
                'name' => $name,
                'slug' => $slug,
                'city' => $city,
                'type' => $type,
                'is_active' => true,
                'sort_order' => $sortOrder,
                'description' => 'Cobertura oficial (cobertura-danhei.md, 2026-06-10).',
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            return;
        }

        // Completar sin pisar: la ciudad solo se corrige si esta vacia o si un
        // municipio quedo con el default generico «Bogotá» de la tabla.
        $updates = [];
        $currentCity = trim((string) $existing->city);
        if ($currentCity === '' || ($city !== 'Bogotá' && $currentCity === 'Bogotá')) {
            $updates['city'] = $city;
        }
        if (trim((string) $existing->type) === '') {
            $updates['type'] = $type;
        }

        if ($updates !== []) {
            $updates['updated_at'] = $now;
            DB::table('zones')->where('id', $existing->id)->update($updates);
        }
    }
};
