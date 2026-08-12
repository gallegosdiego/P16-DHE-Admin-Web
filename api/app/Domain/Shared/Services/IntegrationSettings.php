<?php

namespace App\Domain\Shared\Services;

use App\Domain\Shared\Models\AppSetting;
use App\Domain\Shared\Support\IntegrationSettingDefinitions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Lectura y escritura de las credenciales administrables.
 *
 * Modelo de precedencia: **lo guardado en la base gana sobre `.env`.** Si una
 * clave no está guardada, sigue valiendo la de `.env`. Eso permite instalar
 * esta funcionalidad sin tocar producción: mientras nadie guarde nada, el
 * sistema se comporta exactamente igual que antes.
 */
class IntegrationSettings
{
    private const CACHE_KEY = 'integration_settings:values';

    private const CACHE_SECONDS = 300;

    /**
     * Valores guardados en base, en claro. Solo para uso interno del proveedor
     * de configuración: nunca debe devolverse tal cual por la API.
     *
     * @return array<string, string>
     */
    public function stored(): array
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_SECONDS, function (): array {
            // Antes de que corra la migración —o durante el propio despliegue—
            // la tabla puede no existir. La ausencia no debe tumbar la app.
            try {
                if (! Schema::hasTable('app_settings')) {
                    return [];
                }

                return AppSetting::query()
                    ->get()
                    ->filter(fn (AppSetting $s) => IntegrationSettingDefinitions::has($s->key))
                    ->filter(fn (AppSetting $s) => filled($s->value))
                    ->mapWithKeys(fn (AppSetting $s) => [$s->key => (string) $s->value])
                    ->all();
            } catch (Throwable) {
                return [];
            }
        });
    }

    /**
     * Estado de cada clave para el panel. **Nunca devuelve el valor de un
     * secreto**: solo una máscara. Un secreto se puede cambiar, no leer.
     *
     * @return list<array{
     *     key: string, group: string, label: string, help: string,
     *     secret: bool, configured: bool, source: string, preview: string|null
     * }>
     */
    public function describe(): array
    {
        $stored = $this->stored();
        $rows = [];

        foreach (IntegrationSettingDefinitions::all() as $key => $definition) {
            $inDatabase = array_key_exists($key, $stored);
            $envValue = (string) config($definition['config_key'], '');
            $effective = $inDatabase ? $stored[$key] : $envValue;
            $configured = filled($effective);

            $rows[] = [
                'key' => $key,
                'group' => $definition['group'],
                'label' => $definition['label'],
                'help' => $definition['help'],
                'secret' => $definition['secret'],
                'configured' => $configured,
                'source' => $inDatabase ? 'panel' : ($configured ? 'servidor' : 'sin_configurar'),
                'preview' => $configured
                    ? ($definition['secret'] ? $this->mask($effective) : $effective)
                    : null,
            ];
        }

        return $rows;
    }

    public function set(string $key, ?string $value, ?int $userId): void
    {
        AppSetting::updateOrCreate(
            ['key' => $key],
            ['value' => $value, 'updated_by' => $userId],
        );

        $this->flush();
    }

    /**
     * Borrar devuelve el control a `.env`, que es la vía de escape si alguien
     * guarda un valor equivocado y deja el sistema sin acceso al panel.
     */
    public function forget(string $key): void
    {
        AppSetting::where('key', $key)->delete();

        $this->flush();
    }

    public function flush(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * Deja ver lo justo para reconocer una clave sin revelarla: los últimos
     * cuatro caracteres. Valores cortos se ocultan por completo.
     */
    private function mask(string $value): string
    {
        $length = mb_strlen($value);

        if ($length <= 8) {
            return str_repeat('•', 8);
        }

        return str_repeat('•', 8).mb_substr($value, -4);
    }
}
