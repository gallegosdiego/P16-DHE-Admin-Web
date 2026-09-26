<?php

namespace App\Http\Middleware;

use App\Domain\Client\Models\ClientAddress;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Frontera de las cuentas del portal de clientes.
 *
 * El rol `client` comparte permisos con el equipo (shipments.view, clients.edit…)
 * porque el portal los necesita para unas pocas pantallas, pero las rutas del
 * panel no filtran por empresa. Aquí se invierte la regla para esas cuentas:
 * todo cerrado salvo la lista de rutas que usa el portal, y en las que reciben
 * una empresa o una dirección, solo si son de la suya.
 *
 * Las cuentas del equipo (y las desactivadas, que se cortan) no se ven afectadas
 * por la lista.
 */
class ClientPortalBoundary
{
    /**
     * Rutas abiertas para el portal: "MÉTODO uri" tal como las registra Laravel.
     * `*` al final admite cualquier sufijo (el prefijo client-portal ya filtra por empresa).
     */
    private const ALLOWED = [
        'POST logout',
        'GET me',
        'PUT me',
        'PUT me/password',
        'GET client/my-dashboard',
        'GET service-locations',
        'POST pickup-intakes',
        'GET notifications',
        'GET notifications/unread-count',
        'POST notifications/{notification}/read',
        'POST notifications/read-all',
        'ANY client-portal/*',
    ];

    /** Rutas de la ficha propia: se comprueba la empresa y se limitan los campos. */
    private const OWN_CLIENT = [
        'PUT clients/{client}',
        'POST clients/{client}/addresses',
    ];

    private const OWN_ADDRESS = [
        'PUT client-addresses/{address}',
        'DELETE client-addresses/{address}',
    ];

    /** Lo único que el cliente puede cambiar de su ficha. */
    private const EDITABLE_CLIENT_FIELDS = ['name', 'phone', 'email', 'company', 'company_phone', 'nit'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        if ($user->active === false) {
            $user->currentAccessToken()?->delete();

            return response()->json(['message' => 'Tu acceso está desactivado.'], 401);
        }

        if (! $user->hasPortalClientRoleOnly()) {
            return $next($request);
        }

        $route = $request->route();
        $key = $request->method().' '.($route ? $route->uri() : '');
        $key = preg_replace('#^(\w+) api/#', '$1 ', $key);

        if ($this->matches($key, self::ALLOWED)) {
            return $next($request);
        }

        $ownClientId = (int) $user->client_id;

        if ($ownClientId > 0 && in_array($key, self::OWN_CLIENT, true)) {
            if ((int) $this->routeKey($request, 'client') !== $ownClientId) {
                return $this->forbidden();
            }
            if ($key === 'PUT clients/{client}') {
                $request->replace($request->only(self::EDITABLE_CLIENT_FIELDS));
            }

            return $next($request);
        }

        if ($ownClientId > 0 && in_array($key, self::OWN_ADDRESS, true)) {
            $addressId = (int) $this->routeKey($request, 'address');
            $owner = ClientAddress::query()->whereKey($addressId)->value('client_id');

            if ((int) $owner !== $ownClientId) {
                return $this->forbidden();
            }

            return $next($request);
        }

        return $this->forbidden();
    }

    /** @param  list<string>  $patterns */
    private function matches(string $key, array $patterns): bool
    {
        [$method, $uri] = array_pad(explode(' ', $key, 2), 2, '');

        foreach ($patterns as $pattern) {
            [$pMethod, $pUri] = explode(' ', $pattern, 2);

            if ($pMethod !== 'ANY' && $pMethod !== $method) {
                continue;
            }
            if (str_ends_with($pUri, '*') ? str_starts_with($uri, rtrim($pUri, '*')) : $pUri === $uri) {
                return true;
            }
        }

        return false;
    }

    private function routeKey(Request $request, string $name): mixed
    {
        $value = $request->route($name);

        return is_object($value) ? $value->getKey() : $value;
    }

    private function forbidden(): Response
    {
        return response()->json(['message' => 'Esta acción no está disponible desde el portal de clientes.'], 403);
    }
}
