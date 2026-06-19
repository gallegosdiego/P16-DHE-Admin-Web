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

        // 1. Asignar scopes de forma paralela si el usuario tiene los IDs configurados
        if ($user->client_id) {
            $request->attributes->set('_scoped_client_id', (int) $user->client_id);
        }

        if ($user->driver_id) {
            $request->attributes->set('_scoped_driver_id', (int) $user->driver_id);
        }

        // 2. Permitir paso inmediato a administradores
        if (array_intersect($roleNames, ['superadmin', 'admin', 'administrador', 'operador'])) {
            return $next($request);
        }

        $hasClientRole = (bool) array_intersect($roleNames, ['client', 'cliente']);
        $hasDriverRole = (bool) array_intersect($roleNames, ['driver', 'conductor']);

        if (! $hasClientRole && ! $hasDriverRole) {
            return response()->json(['error' => 'Rol no reconocido o sin permisos.'], 403);
        }

        // 3. Validar accesos según rol y presencia de scope
        if ($hasClientRole && ! $request->attributes->has('_scoped_client_id')) {
            return response()->json([
                'error' => 'Tu cuenta no tiene un cliente asociado. Contacta soporte.',
            ], 403);
        }

        if ($hasDriverRole && ! $request->attributes->has('_scoped_driver_id')) {
            return response()->json([
                'error' => 'Tu cuenta no tiene un conductor asociado. Contacta soporte.',
            ], 403);
        }

        return $next($request);
    }
}
