<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La foto con la que el cliente declara un paquete.
 *
 * Hasta ahora el cliente tenía que escribir la dirección de entrega completa
 * para cada paquete. Con la foto de la guía o del paquete puede declararlo sin
 * transcribir nada, y la operación completa los datos al recibirlo. La regla
 * es "dirección o foto": al menos una de las dos.
 *
 * Es distinta de la evidencia de recepción (`pickup_batch_item_evidence`), que
 * documenta una novedad en el mostrador. Esta es la declaración del cliente y
 * nace antes de que exista lote alguno.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pickup_packages', function (Blueprint $table) {
            if (! Schema::hasColumn('pickup_packages', 'declared_photo_path')) {
                $table->string('declared_photo_path', 255)->nullable()->after('special_handling_notes');
                $table->string('declared_photo_sha256', 64)->nullable()->after('declared_photo_path');
                $table->string('declared_photo_mime', 100)->nullable()->after('declared_photo_sha256');
                $table->unsignedInteger('declared_photo_size')->nullable()->after('declared_photo_mime');
            }
        });
    }

    public function down(): void
    {
        Schema::table('pickup_packages', function (Blueprint $table) {
            $table->dropColumn([
                'declared_photo_path',
                'declared_photo_sha256',
                'declared_photo_mime',
                'declared_photo_size',
            ]);
        });
    }
};
