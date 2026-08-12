<?php

namespace App\Domain\Shared\Services;

use App\Domain\Shared\Models\ErrorEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Persiste los incidentes de la API para poder consultarlos desde el panel.
 *
 * **Este código se ejecuta mientras algo ya está fallando.** De ahí su regla
 * principal: no puede empeorar la situación bajo ninguna circunstancia. Todo va
 * envuelto en `try/catch` y cualquier fallo propio se traga en silencio — el
 * registro en `storage/logs/` sigue ocurriendo por separado en
 * `bootstrap/app.php`, así que no se pierde nada por no insistir aquí.
 *
 * Un caso concreto: si la excepción original es que la base de datos no
 * responde, escribir en la base también fallará. Eso es esperable y no debe
 * convertir un 500 en una cascada.
 */
class ErrorEventRecorder
{
    /** Recortes para que un incidente no ocupe más de lo razonable. */
    private const MAX_MESSAGE = 2000;

    private const MAX_TRACE = 8000;

    /**
     * Ventana en segundos durante la cual no se repite el mismo incidente.
     * Un error en bucle llenaría la tabla y ahogaría lo demás; con esto queda
     * una fila por tipo, ruta y minuto.
     */
    private const DEDUPE_SECONDS = 60;

    public function record(Throwable $exception, Request $request, string $errorId, ?int $status = null): void
    {
        try {
            if (! Schema::hasTable('error_events')) {
                return;
            }

            $exceptionClass = $exception::class;
            $path = mb_substr($request->path(), 0, 255);

            if ($this->recentlyRecorded($exceptionClass, $path)) {
                return;
            }

            ErrorEvent::create([
                'error_id' => $errorId,
                'status' => $status,
                'method' => mb_substr($request->method(), 0, 10),
                'path' => $path,
                'route' => $request->route()?->uri(),
                'user_id' => $this->userId($request),
                'exception_class' => mb_substr($exceptionClass, 0, 191),
                'message' => mb_substr($exception->getMessage(), 0, self::MAX_MESSAGE),
                'file' => mb_substr((string) $exception->getFile(), 0, 255),
                'line' => $exception->getLine(),
                'trace' => mb_substr($exception->getTraceAsString(), 0, self::MAX_TRACE),
                'occurred_at' => now(),
            ]);
        } catch (Throwable) {
            // Silencio deliberado. Ver la nota de la clase.
        }
    }

    private function recentlyRecorded(string $exceptionClass, string $path): bool
    {
        return ErrorEvent::query()
            ->where('exception_class', $exceptionClass)
            ->where('path', $path)
            ->where('occurred_at', '>=', now()->subSeconds(self::DEDUPE_SECONDS))
            ->exists();
    }

    /**
     * Resolver el usuario puede fallar si la propia autenticación es la causa
     * del incidente, así que su ausencia no debe impedir el registro.
     */
    private function userId(Request $request): ?int
    {
        try {
            return $request->user()?->getAuthIdentifier();
        } catch (Throwable) {
            return null;
        }
    }
}
