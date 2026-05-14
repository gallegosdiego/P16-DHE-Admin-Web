<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware que restringe el acceso a datos del cliente autenticado.
 *
 * Cuando un usuario con rol "client" accede a endpoints de envíos,
 * este middleware inyecta automáticamente el filtro client_id
 * para que SOLO vea sus propios datos.
 *
 * Uso en rutas:
 *   ->middleware('scope:client')
 *
 * El middleware NO afecta a usuarios con rol admin/superadmin,
 * quienes mantienen visibilidad total.
 */
class ScopeClient
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'No autenticado.'], 401);
        }

        // Admin y superadmin ven todo — no se aplica scope
        if ($user->hasRole('superadmin') || $user->hasRole('admin')) {
            return $next($request);
        }

        // Si el usuario tiene rol "client", inyectar client_id en el request
        if ($user->hasAnyRole(['client', 'cliente'])) {
            $clientId = $user->client_id;

            if (! $clientId) {
                return response()->json([
                    'error' => 'Tu cuenta no tiene un cliente asociado. Contacta soporte.',
                ], 403);
            }

            // Merge el client_id en el request para que los controllers
            // puedan filtrar automáticamente
            $request->merge(['_scoped_client_id' => $clientId]);
        }

        // Si el usuario tiene rol "driver", inyectar driver_id
        if ($user->hasAnyRole(['driver', 'conductor'])) {
            $driverId = $user->driver_id;

            if (! $driverId) {
                return response()->json([
                    'error' => 'Tu cuenta no tiene un conductor asociado. Contacta soporte.',
                ], 403);
            }

            $request->merge(['_scoped_driver_id' => $driverId]);
        }

        return $next($request);
    }
}
