<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Dirección o foto": si el cliente declara el paquete con una foto de la
 * guía, el destinatario y la dirección están EN la foto y la operación los
 * transcribe al recibirlo. Exigirlos en la base contradice la regla.
 *
 * La validación sigue exigiendo uno de los dos caminos: esto solo deja de
 * imponer el que asume que siempre se escriben.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pickup_packages', function (Blueprint $table) {
            $table->string('recipient_name', 120)->nullable()->change();
            $table->string('recipient_phone', 24)->nullable()->change();
            $table->string('delivery_address_line1', 200)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('pickup_packages', function (Blueprint $table) {
            $table->string('recipient_name', 120)->nullable(false)->change();
            $table->string('recipient_phone', 24)->nullable(false)->change();
            $table->string('delivery_address_line1', 200)->nullable(false)->change();
        });
    }
};
