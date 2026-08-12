<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Login — Genera un token Sanctum.
     */
    /**
     * Cuánto vive el token de cada tipo de dispositivo.
     *
     * Hasta agosto de 2026 los tokens **no caducaban nunca**: `config/sanctum.php`
     * no existía, así que regía el valor por defecto `expiration => null`. Un
     * token filtrado servía indefinidamente y solo se revocaba borrándolo a mano
     * en la base.
     *
     * La caducidad se fija por dispositivo, no global, porque el riesgo y el
     * costo de expirar no son los mismos:
     *
     * - **Panel web**: se usa desde equipos compartidos y de escritorio, donde
     *   una sesión olvidada es un riesgo real. Volver a entrar cuesta segundos.
     * - **App del piloto**: vive en un teléfono personal, con el token en
     *   almacenamiento cifrado del sistema. Expirarlo a media jornada dejaría a
     *   alguien sin poder cerrar entregas en la calle, así que se le da margen.
     *
     * Los tokens ya emitidos conservan `expires_at = null` y siguen siendo
     * válidos: la caducidad se aplica a partir del siguiente inicio de sesión,
     * de modo que desplegar esto no expulsa a nadie.
     */
    private function tokenExpiryFor(string $deviceName): \DateTimeInterface
    {
        $esAppMovil = str_starts_with($deviceName, 'P15_');

        return $esAppMovil ? now()->addDays(30) : now()->addHours(12);
    }

    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['sometimes', 'string', 'max:100'],
        ]);

        $deviceName = $request->input('device_name', 'web-session');

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Credenciales incorrectas.'],
            ]);
        }

        // Revocar tokens anteriores del mismo dispositivo
        $user->tokens()->where('name', $deviceName)->delete();

        $token = $user->createToken($deviceName, ['*'], $this->tokenExpiryFor($deviceName))->plainTextToken;

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'client_id' => $user->client_id,
                'driver_id' => $user->driver_id,
                'roles' => $user->getRoleNames(),
                'permissions' => $user->getAllPermissions()->pluck('name'),
            ],
            'token' => $token,
        ]);
    }

    /**
     * Logout — Revoca el token actual.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Sesión cerrada.']);
    }

    /**
     * Me — Retorna el usuario autenticado.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'client_id' => $user->client_id,
            'driver_id' => $user->driver_id,
            'roles' => $user->getRoleNames(),
            'permissions' => $user->getAllPermissions()->pluck('name'),
        ]);
    }

    /**
     * Actualizar perfil del usuario autenticado.
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:24'],
        ]);

        $user->update($validated);

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'client_id' => $user->client_id,
            'driver_id' => $user->driver_id,
            'roles' => $user->getRoleNames(),
            'permissions' => $user->getAllPermissions()->pluck('name'),
            'message' => 'Perfil actualizado.',
        ]);
    }

    /**
     * Cambiar contraseña del usuario autenticado.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();

        if (! Hash::check($request->current_password, $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['La contraseña actual es incorrecta.'],
            ]);
        }

        $user->update(['password' => Hash::make($request->password)]);

        // Revocar todos los tokens excepto el actual
        $currentToken = $user->currentAccessToken();
        if ($currentToken) {
            $user->tokens()->where('id', '!=', $currentToken->id)->delete();
        }

        return response()->json(['message' => 'Contraseña actualizada.']);
    }

    /**
     * Health check — Verifica que la API está activa.
     */
    public function health(): JsonResponse
    {
        return response()->json([
            'status' => 'ok',
            'app' => 'Danhei Express API',
            'version' => '1.0.0',
            'timestamp' => now()->toIso8601String(),
        ]);
    }
}
