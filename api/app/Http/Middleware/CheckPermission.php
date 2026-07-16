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
            return response()->json([
                'message' => 'Sesión expirada. Vuelve a iniciar sesión.',
                'error' => 'No autenticado.',
                'code' => 'auth_expired',
                'retryable' => false,
            ], 401);
        }

        // El usuario puede tener roles equivalentes en los guards web y sanctum.
        // Consultar la colección evita que el bypass dependa del guard que Spatie
        // infiera para la solicitud actual.
        if ($user->getRoleNames()->contains('superadmin')) {
            return $next($request);
        }

        foreach ($permissions as $permission) {
            if (! $user->hasPermissionTo($permission)) {
                return response()->json([
                    'message' => 'No tienes permiso para esta acción.',
                    'error' => 'No tienes permiso para esta acción.',
                    'code' => 'forbidden',
                    'retryable' => false,
                    'required_permission' => $permission,
                ], 403);
            }
        }

        return $next($request);
    }
}
