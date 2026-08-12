<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shared\Services\IntegrationSettings;
use App\Domain\Shared\Support\IntegrationSettingDefinitions;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Administración de credenciales de integración desde el panel.
 *
 * Tres reglas que definen el diseño:
 *
 *  1. **Escritura ciega.** Un secreto guardado no se devuelve jamás, ni al
 *     superadmin: solo una máscara con los últimos cuatro caracteres. Se puede
 *     cambiar, no leer. Así ni un pantallazo ni una sesión compartida lo exponen.
 *  2. **Catálogo cerrado.** Solo se aceptan las claves declaradas. Admitir
 *     nombres arbitrarios convertiría este permiso en escritura libre sobre la
 *     configuración de Laravel.
 *  3. **Bitácora sin valores.** Cada cambio queda registrado con quién y qué
 *     clave, nunca con el valor: la bitácora la leen más ojos que esta pantalla.
 */
class IntegrationSettingController extends Controller
{
    public function __construct(private readonly IntegrationSettings $settings)
    {
    }

    public function index(): JsonResponse
    {
        return response()->json(['settings' => $this->settings->describe()]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'key' => ['required', 'string', Rule::in(array_keys(IntegrationSettingDefinitions::all()))],
            'value' => ['present', 'nullable', 'string', 'max:4096'],
        ]);

        $key = $validated['key'];
        $value = isset($validated['value']) ? trim((string) $validated['value']) : null;

        if ($denial = $this->denyIfSecretWithoutSuperadmin($request, $key)) {
            return $denial;
        }

        $existed = array_key_exists($key, $this->settings->stored());

        if ($value === null || $value === '') {
            // Vaciar devuelve el control al valor del servidor. Es la vía de
            // escape si alguien guarda una credencial equivocada.
            $this->settings->forget($key);
            $action = $existed ? 'settings.integration_cleared' : 'settings.integration_noop';
        } else {
            $this->settings->set($key, $value, $request->user()?->id);
            $action = $existed ? 'settings.integration_updated' : 'settings.integration_created';
        }

        AuditLog::log(
            $action,
            null,
            null,
            // Solo la clave. El valor nunca entra a la bitácora.
            ['key' => $key, 'is_secret' => IntegrationSettingDefinitions::isSecret($key)],
            'Credencial de integración modificada desde el panel: '.$key,
        );

        return response()->json([
            'message' => 'Configuración actualizada.',
            'settings' => $this->settings->describe(),
        ]);
    }

    /**
     * Los secretos exigen superadmin. `settings.edit` lo tienen más roles, y
     * cambiar una credencial de integración no es lo mismo que ajustar una
     * preferencia operativa.
     */
    private function denyIfSecretWithoutSuperadmin(Request $request, string $key): ?JsonResponse
    {
        if (! IntegrationSettingDefinitions::isSecret($key)) {
            return null;
        }

        if ($request->user()?->getRoleNames()->contains('superadmin')) {
            return null;
        }

        return response()->json([
            'message' => 'Solo un superadministrador puede modificar credenciales.',
            'code' => 'forbidden',
            'retryable' => false,
        ], 403);
    }
}
