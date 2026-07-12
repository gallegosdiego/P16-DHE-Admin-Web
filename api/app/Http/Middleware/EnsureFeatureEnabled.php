<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureFeatureEnabled
{
    public function handle(Request $request, Closure $next, string $configKey): Response
    {
        if (! (bool) config($configKey, false)) {
            return new JsonResponse([
                'message' => 'Integracion no disponible.',
                'code' => 'integration_disabled',
                'retryable' => false,
            ], 404);
        }

        return $next($request);
    }
}
