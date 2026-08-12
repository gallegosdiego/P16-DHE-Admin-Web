<?php

use App\Domain\Shipment\Services\TrackingCodeGenerator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Token público de rastreo, opaco y aleatorio.
 *
 * El rastreo público identificaba los envíos por `display_code` (#DHE00042),
 * un consecutivo global. Cualquiera podía iterar 1..N contra `/api/track` y
 * extraer nombre, ciudad y estado de cada destinatario: exposición de datos
 * personales bajo la Ley 1581.
 *
 * `public_token` es un identificador de 128 bits sin relación con el
 * consecutivo. No se puede adivinar ni enumerar. Los códigos de guía siguen
 * existiendo para uso interno y para el rastreo manual con segundo factor.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('shipments', 'public_token')) {
            Schema::table('shipments', function (Blueprint $table) {
                $table->string('public_token', 32)->nullable()->unique()->after('display_code');
            });
        }

        // Rellenar los envíos ya existentes. En producción son pocos; el bucle
        // por lotes evita cargar toda la tabla en memoria en cualquier entorno.
        $generator = new TrackingCodeGenerator;

        DB::table('shipments')->whereNull('public_token')->orderBy('id')
            ->select('id')->chunkById(200, function ($rows) use ($generator) {
                foreach ($rows as $row) {
                    DB::table('shipments')
                        ->where('id', $row->id)
                        ->update(['public_token' => $generator->freshPublicToken()]);
                }
            });
    }

    public function down(): void
    {
        if (Schema::hasColumn('shipments', 'public_token')) {
            Schema::table('shipments', function (Blueprint $table) {
                $table->dropUnique(['public_token']);
                $table->dropColumn('public_token');
            });
        }
    }
};
