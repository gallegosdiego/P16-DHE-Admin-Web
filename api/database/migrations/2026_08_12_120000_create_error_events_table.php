<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Incidentes de la API, consultables desde el panel.
 *
 * `bootstrap/app.php` ya registraba cada excepción con un `error_id`, la ruta y
 * el usuario — pero a `storage/logs/`, que en este hosting solo se lee abriendo
 * archivos por el Administrador de archivos. En la práctica nadie los miraba, y
 * el 12 de agosto de 2026 un fallo de acceso costó una hora de diagnóstico a
 * ciegas: el usuario veía un mensaje genérico y no quedaba rastro consultable.
 *
 * Persistirlos aquí los vuelve visibles sin terminal y sin depender de un
 * servicio externo.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('error_events')) {
            return;
        }

        Schema::create('error_events', function (Blueprint $table) {
            $table->id();
            // El mismo identificador que se devuelve al cliente en `X-Error-ID`:
            // permite pasar de «me salió un error» a la traza exacta.
            $table->uuid('error_id')->index();
            $table->unsignedSmallInteger('status')->nullable();
            $table->string('method', 10);
            $table->string('path', 255);
            $table->string('route', 255)->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('exception_class', 191)->index();
            $table->text('message');
            $table->string('file', 255)->nullable();
            $table->unsignedInteger('line')->nullable();
            $table->text('trace')->nullable();
            $table->timestamp('occurred_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('error_events');
    }
};
