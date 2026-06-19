<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Applies tenant/driver scoping for client and driver API users.
 *
 * Admin-like roles keep full visibility. Client and driver roles receive
 * internal request attributes that controllers can trust because they do not
 * come from user-controlled input.
 */
class ScopeClient
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'No autenticado.'], 401);
        }

        $roleNames = $user->roles()->pluck('name')->all();

        if (array_intersect($roleNames, ['superadmin', 'admin', 'administrador', 'operador'])) {
            return $next($request);
        }

        if (! array_intersect($roleNames, ['admin', 'administrador', 'operador', 'superadmin', 'client', 'cliente', 'driver', 'conductor'])) {
            return response()->json(['error' => 'Rol no reconocido.'], 403);
        }

        if (array_intersect($roleNames, ['client', 'cliente'])) {
            $clientId = $user->client_id;

            if (! $clientId) {
                return response()->json([
                    'error' => 'Tu cuenta no tiene un cliente asociado. Contacta soporte.',
                ], 403);
            }

            $request->attributes->set('_scoped_client_id', $clientId);
        }

        if (array_intersect($roleNames, ['driver', 'conductor'])) {
            $driverId = $user->driver_id;

            if (! $driverId) {
                return response()->json([
                    'error' => 'Tu cuenta no tiene un conductor asociado. Contacta soporte.',
                ], 403);
            }

            $request->attributes->set('_scoped_driver_id', $driverId);
        }

        return $next($request);
    }
}
