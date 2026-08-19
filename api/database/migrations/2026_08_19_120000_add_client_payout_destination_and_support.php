<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cuenta destino y soporte de las transferencias COD al cliente (FIN-04).
 *
 * Hasta ahora un pago al cliente registraba cuanto se transfirio, pero no a
 * donde ni con que prueba. Estas columnas cierran las dos preguntas:
 *
 *  - destination_*: copia inmutable de la cuenta a la que se envio el dinero.
 *    Se escribe a mano en cada transferencia y queda congelada en el
 *    movimiento; si manana el cliente cambia de cuenta, el comprobante viejo
 *    sigue diciendo la verdad de aquel dia.
 *  - support_*: el comprobante del banco o de Nequi. Es opcional a proposito
 *    —a veces se paga antes de tener el soporte a mano— y por eso se adjunta
 *    en un segundo paso, sin tocar la peticion idempotente que mueve dinero.
 *
 * No se indexa support_path: la consulta de «transferencias sin soporte» se
 * acota siempre por cliente, que ya tiene indice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('client_cod_payouts', function (Blueprint $table) {
            if (! Schema::hasColumn('client_cod_payouts', 'destination_kind')) {
                $table->string('destination_kind', 24)->nullable()->after('method');
            }
            if (! Schema::hasColumn('client_cod_payouts', 'destination_bank')) {
                $table->string('destination_bank', 80)->nullable()->after('destination_kind');
            }
            if (! Schema::hasColumn('client_cod_payouts', 'destination_account_type')) {
                $table->string('destination_account_type', 24)->nullable()->after('destination_bank');
            }
            if (! Schema::hasColumn('client_cod_payouts', 'destination_account_number')) {
                $table->string('destination_account_number', 40)->nullable()->after('destination_account_type');
            }
            if (! Schema::hasColumn('client_cod_payouts', 'destination_holder_name')) {
                $table->string('destination_holder_name', 120)->nullable()->after('destination_account_number');
            }
            if (! Schema::hasColumn('client_cod_payouts', 'destination_holder_document')) {
                $table->string('destination_holder_document', 40)->nullable()->after('destination_holder_name');
            }
        });

        Schema::table('client_cod_payouts', function (Blueprint $table) {
            if (! Schema::hasColumn('client_cod_payouts', 'support_path')) {
                $table->string('support_path', 500)->nullable()->after('notes');
            }
            if (! Schema::hasColumn('client_cod_payouts', 'support_sha256')) {
                $table->string('support_sha256', 64)->nullable()->after('support_path');
            }
            if (! Schema::hasColumn('client_cod_payouts', 'support_mime')) {
                $table->string('support_mime', 120)->nullable()->after('support_sha256');
            }
            if (! Schema::hasColumn('client_cod_payouts', 'support_size')) {
                $table->unsignedBigInteger('support_size')->nullable()->after('support_mime');
            }
            if (! Schema::hasColumn('client_cod_payouts', 'support_uploaded_at')) {
                $table->timestamp('support_uploaded_at')->nullable()->after('support_size');
            }
            if (! Schema::hasColumn('client_cod_payouts', 'support_uploaded_by')) {
                $table->foreignId('support_uploaded_by')
                    ->nullable()
                    ->after('support_uploaded_at')
                    ->constrained('users')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('client_cod_payouts', function (Blueprint $table) {
            if (Schema::hasColumn('client_cod_payouts', 'support_uploaded_by')) {
                $table->dropConstrainedForeignId('support_uploaded_by');
            }
        });

        Schema::table('client_cod_payouts', function (Blueprint $table) {
            foreach ([
                'destination_kind',
                'destination_bank',
                'destination_account_type',
                'destination_account_number',
                'destination_holder_name',
                'destination_holder_document',
                'support_path',
                'support_sha256',
                'support_mime',
                'support_size',
                'support_uploaded_at',
            ] as $column) {
                if (Schema::hasColumn('client_cod_payouts', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
