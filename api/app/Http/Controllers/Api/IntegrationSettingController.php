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
     * Genera una APP_KEY válida para que se copie al `.env` a mano.
     *
     * **Deliberadamente no la guarda ni la aplica.** APP_KEY no es
     * configuración de la aplicación: es la llave con la que Laravel arranca y
     * cifra la propia bóveda. Si el panel pudiera reescribirla y algo saliera
     * mal, lo primero que dejaría de funcionar sería el panel — y entonces no
     * habría forma de deshacerlo desde ahí. Se acabaría en el Administrador de
     * archivos igualmente, pero con el sistema caído en vez de funcionando.
     *
     * Así que se separa lo incómodo de lo peligroso: generar una clave válida
     * es trivial y sin riesgo, y es lo que este endpoint resuelve. Escribirla
     * sigue siendo un acto manual y consciente.
     *
     * Se informa además de si la bóveda está vacía, porque eso determina el
     * costo real de rotar: con credenciales guardadas, cambiar la llave las
     * vuelve ilegibles y hay que volver a pedirlas a cada proveedor.
     */
    public function generateAppKey(Request $request): JsonResponse
    {
        if ($denial = $this->denyUnlessSuperadmin($request)) {
            return $denial;
        }

        AuditLog::log(
            'settings.app_key_generated',
            null,
            null,
            // La clave generada NO entra en la bitácora: solo el hecho.
            ['generated' => true],
            'Se generó una APP_KEY nueva para rotación manual.',
        );

        $vaultCount = count($this->settings->stored());

        return response()->json([
            'key' => 'base64:'.base64_encode(random_bytes(32)),
            'vault_is_empty' => $vaultCount === 0,
            'stored_credentials' => $vaultCount,
            'env_path' => '/home/danheiex/api.danheiexpress.com/.env',
        ]);
    }

    private function denyUnlessSuperadmin(Request $request): ?JsonResponse
    {
        if ($request->user()?->getRoleNames()->contains('superadmin')) {
            return null;
        }

        return response()->json([
            'message' => 'Solo un superadministrador puede realizar esta acción.',
            'code' => 'forbidden',
            'retryable' => false,
        ], 403);
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
