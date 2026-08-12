<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Crea los índices que MySQL rechazó por tener el nombre demasiado largo.
 *
 * Laravel deriva el nombre de un índice sin nombre propio concatenando tabla,
 * columnas y tipo. Tres de ellos superaban los 64 caracteres que MySQL admite
 * como identificador, y la migración original fallaba al llegar ahí.
 *
 * En SQLite —que es donde corren las pruebas— no hay ese límite, así que el
 * problema era invisible: la suite pasaba en verde y el índice faltaba solo en
 * producción. Se descubrió al ejecutar la suite por accidente contra MariaDB.
 *
 * El más importante es `dcra_remittance_obligation_unique`: impide asignar dos
 * veces la misma obligación de recaudo a una misma remesa. Sin él, un reintento
 * o un doble clic podía duplicar una asignación de dinero de un piloto sin que
 * nada lo bloqueara.
 *
 * Las migraciones de origen ya llevan nombre explícito, pero figuran como
 * aplicadas y no volverán a ejecutarse: de ahí esta migración correctiva.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->crear('driver_cod_remittance_allocations', 'dcra_remittance_obligation_unique',
            fn (Blueprint $t) => $t->unique(['remittance_id', 'obligation_id'], 'dcra_remittance_obligation_unique'));

        $this->crear('driver_service_earnings', 'dse_driver_shipment_service_unique',
            fn (Blueprint $t) => $t->unique(['driver_id', 'shipment_id', 'service_type'], 'dse_driver_shipment_service_unique'));

        $this->crear('financial_rate_rules', 'frr_service_active_vigencia_index',
            fn (Blueprint $t) => $t->index(['service_type', 'is_active', 'effective_from', 'effective_to'], 'frr_service_active_vigencia_index'));

        $this->crear('financial_rate_rules', 'frr_scope_index',
            fn (Blueprint $t) => $t->index(['scope_type', 'driver_id', 'client_id', 'zone_id'], 'frr_scope_index'));

        $this->crear('pickup_batch_item_evidence', 'pbie_item_type_index',
            fn (Blueprint $t) => $t->index(['pickup_batch_item_id', 'evidence_type'], 'pbie_item_type_index'));
    }

    /**
     * Crea el índice solo si la tabla existe y el índice no.
     *
     * En un entorno nuevo las migraciones de origen ya lo habrán creado con su
     * nombre explícito, así que aquí no habría nada que hacer.
     */
    private function crear(string $tabla, string $indice, callable $definicion): void
    {
        if (! Schema::hasTable($tabla) || Schema::hasIndex($tabla, $indice)) {
            return;
        }

        // Una restricción única puede fallar si ya existen filas duplicadas.
        // Es preferible que el despliegue lo señale a crear el índice
        // silenciosamente sobre datos inconsistentes.
        Schema::table($tabla, $definicion);
    }

    public function down(): void
    {
        foreach ([
            ['driver_cod_remittance_allocations', 'dcra_remittance_obligation_unique'],
            ['driver_service_earnings', 'dse_driver_shipment_service_unique'],
            ['financial_rate_rules', 'frr_service_active_vigencia_index'],
            ['financial_rate_rules', 'frr_scope_index'],
            ['pickup_batch_item_evidence', 'pbie_item_type_index'],
        ] as [$tabla, $indice]) {
            if (Schema::hasTable($tabla) && Schema::hasIndex($tabla, $indice)) {
                Schema::table($tabla, fn (Blueprint $t) => $t->dropIndex($indice));
            }
        }
    }
};
