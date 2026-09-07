<?php

namespace App\Domain\Shipment\Support;

use Illuminate\Support\Str;

/**
 * Catálogo oficial de alias y equivalencias de vías principales de Bogotá.
 * Fuente: Secretaría Distrital de Movilidad / Catastro Distrital / IDECA.
 *
 * Mapea la nomenclatura numérica estándar con los nombres emblemáticos de avenidas.
 * Diseñado como catálogo modular desacoplado del código de geocodificación para fácil expansión.
 */
class BogotaRoadAliases
{
    /**
     * Equivalencias bidireccionales de vías en Bogotá.
     * Clave: nombre canónico normalizado (slug sin tildes).
     * Valor: array con datos oficiales [nombre estándar, nombres alternos / alias].
     *
     * @var array<string, array{standard: string, aliases: list<string>}>
     */
    public const ROADS = [
        'calle-19' => [
            'standard' => 'Calle 19',
            'aliases' => [
                'Avenida Ciudad de Lima',
                'Avenida Calle 19',
                'Av Ciudad de Lima',
            ],
        ],
        'calle-26' => [
            'standard' => 'Calle 26',
            'aliases' => [
                'Avenida El Dorado',
                'Avenida Calle 26',
                'Av El Dorado',
                'Avenida Jorge Eliecer Gaitan',
            ],
        ],
        'carrera-10' => [
            'standard' => 'Carrera 10',
            'aliases' => [
                'Avenida Fernando Mazuera',
                'Avenida Carrera 10',
                'Av Fernando Mazuera',
            ],
        ],
        'carrera-7' => [
            'standard' => 'Carrera 7',
            'aliases' => [
                'Avenida Alberto Lleras Camargo',
                'Avenida Carrera 7',
                'Av Carrera 7',
                'Avenida Septima',
            ],
        ],
        'carrera-14' => [
            'standard' => 'Carrera 14',
            'aliases' => [
                'Avenida Caracas',
                'Avenida Carrera 14',
                'Av Caracas',
            ],
        ],
        'carrera-30' => [
            'standard' => 'Carrera 30',
            'aliases' => [
                'Avenida NQS',
                'Avenida Carrera 30',
                'Avenida Ciudad de Quito',
                'Av NQS',
            ],
        ],
        'carrera-68' => [
            'standard' => 'Carrera 68',
            'aliases' => [
                'Avenida Congreso Eucaristico',
                'Avenida Carrera 68',
                'Av Carrera 68',
            ],
        ],
        'calle-80' => [
            'standard' => 'Calle 80',
            'aliases' => [
                'Autopista Medellin',
                'Avenida Calle 80',
                'Av Calle 80',
            ],
        ],
        'calle-100' => [
            'standard' => 'Calle 100',
            'aliases' => [
                'Avenida Espana',
                'Avenida Calle 100',
                'Av Espana',
            ],
        ],
        'calle-72' => [
            'standard' => 'Calle 72',
            'aliases' => [
                'Avenida Chile',
                'Avenida Calle 72',
                'Av Chile',
            ],
        ],
        'calle-63' => [
            'standard' => 'Calle 63',
            'aliases' => [
                'Avenida Jose Celestino Mutis',
                'Avenida Calle 63',
                'Av Celestino Mutis',
            ],
        ],
        'calle-53' => [
            'standard' => 'Calle 53',
            'aliases' => [
                'Avenida Francisco Miranda',
                'Avenida Calle 53',
            ],
        ],
        'calle-13' => [
            'standard' => 'Calle 13',
            'aliases' => [
                'Avenida Centenario',
                'Avenida Jimenez',
                'Avenida Colon',
                'Avenida Calle 13',
            ],
        ],
        'carrera-1' => [
            'standard' => 'Carrera 1',
            'aliases' => [
                'Avenida Circunvalar',
                'Av Circunvalar',
            ],
        ],
        'carrera-50' => [
            'standard' => 'Carrera 50',
            'aliases' => [
                'Avenida Batallon Caldas',
                'Avenida Carrera 50',
            ],
        ],
        'carrera-24' => [
            'standard' => 'Carrera 24',
            'aliases' => [
                'Avenida Park Way',
                'Parkway',
            ],
        ],
        'carrera-86' => [
            'standard' => 'Carrera 86',
            'aliases' => [
                'Avenida Ciudad de Cali',
                'Avenida Carrera 86',
            ],
        ],
    ];

    /**
     * Obtiene los alias de búsqueda recomendados para una vía o dirección de Bogotá.
     *
     * @return list<string>
     */
    public static function getAliasesForAddress(string $address): array
    {
        $normalized = Str::slug($address);

        foreach (self::ROADS as $key => $data) {
            if (str_contains($normalized, $key)) {
                return $data['aliases'];
            }

            foreach ($data['aliases'] as $alias) {
                $aliasSlug = Str::slug($alias);
                if (str_contains($normalized, $aliasSlug)) {
                    return array_values(array_unique(array_merge([$data['standard']], $data['aliases'])));
                }
            }
        }

        return [];
    }

    /**
     * Determina si dos nombres de vía son equivalentes según el catálogo de alias.
     */
    public static function areRoadsEquivalent(?string $roadA, ?string $roadB): bool
    {
        if (! filled($roadA) || ! filled($roadB)) {
            return false;
        }

        $slugA = Str::slug($roadA);
        $slugB = Str::slug($roadB);

        if ($slugA === $slugB) {
            return true;
        }

        foreach (self::ROADS as $key => $data) {
            $allForms = array_map(fn ($item) => Str::slug($item), array_merge([$data['standard']], $data['aliases']));
            $allForms[] = $key;

            $hasA = in_array($slugA, $allForms, true);
            $hasB = in_array($slugB, $allForms, true);

            if ($hasA && $hasB) {
                return true;
            }
        }

        return false;
    }
}
