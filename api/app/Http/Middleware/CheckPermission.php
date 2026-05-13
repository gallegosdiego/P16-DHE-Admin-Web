<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware que verifica permisos Spatie.
 *
 * Uso en rutas:
 *   ->middleware('permission:shipments.view')
 *   ->middleware('permission:financial.view,financial.collect')  // requiere TODOS
 */
class CheckPermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'No autenticado.'], 401);
        }

        // Superadmin tiene bypass total (ya configurado en Gate::before)
        if ($user->hasRole('superadmin')) {
            return $next($request);
        }

        foreach ($permissions as $permission) {
            if (! $user->hasPermissionTo($permission)) {
                return response()->json([
                    'error' => 'No tienes permiso para esta acción.',
                    'required_permission' => $permission,
                ], 403);
            }
        }

        return $next($request);
    }
}
