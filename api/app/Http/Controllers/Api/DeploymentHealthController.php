<?php

namespace App\Http\Controllers\Api;

use App\Domain\Operations\Services\DeploymentVerification;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Estado de salud del despliegue, apto para un monitor externo.
 *
 * Deliberadamente público y deliberadamente escueto. Un servicio de monitoreo
 * (Healthchecks.io, UptimeRobot) solo necesita distinguir 200 de 503; el
 * detalle de qué falló es información sensible y vive en
 * `GET /api/runtime-check`, que exige autenticación.
 *
 * Existe porque el servidor no tiene terminal: sin esto, comprobar un
 * despliegue obliga a entrar a phpMyAdmin y ejecutar consultas a mano.
 */
class DeploymentHealthController extends Controller
{
    private const CACHE_KEY = 'deployment:health';

    private const CACHE_SECONDS = 60;

    public function show(DeploymentVerification $verification): JsonResponse
    {
        // Cachear evita que un monitor con intervalo corto castigue a
        // information_schema en cada consulta.
        try {
            $state = Cache::remember(
                self::CACHE_KEY,
                self::CACHE_SECONDS,
                static fn () => $verification->verify(),
            );
        } catch (Throwable $exception) {
            Log::error('deployment_health.verification_failed', [
                'message' => $exception->getMessage(),
            ]);

            return response()->json([
                'status' => 'unknown',
            ], 503);
        }

        if ($state['healthy']) {
            return response()->json(['status' => 'ok']);
        }

        Log::warning('deployment_health.degraded', [
            'failures' => $state['failures'],
        ]);

        // Solo el recuento. Enumerar públicamente qué columnas faltan sería
        // decirle a un atacante dónde está incompleto el sistema.
        return response()->json([
            'status' => 'degraded',
            'failed_checks' => count($state['failures']),
        ], 503);
    }
}
