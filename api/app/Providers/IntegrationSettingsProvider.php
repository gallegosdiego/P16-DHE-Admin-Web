<?php

namespace App\Providers;

use App\Domain\Shared\Services\IntegrationSettings;
use App\Domain\Shared\Support\IntegrationSettingDefinitions;
use Illuminate\Support\ServiceProvider;
use Throwable;

/**
 * Superpone las credenciales guardadas en base sobre la configuración de Laravel.
 *
 * Gracias a esto, `GeocodingService` sigue leyendo
 * `config('services.google.maps_key')` sin enterarse de que el valor puede venir
 * ahora del panel. Ningún consumidor cambia.
 *
 * Si no hay nada guardado —que es el estado de partida— la configuración queda
 * intacta y el sistema se comporta exactamente igual que antes.
 */
class IntegrationSettingsProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(IntegrationSettings::class);
    }

    public function boot(): void
    {
        // Durante `migrate` o `config:clear` la base puede no estar disponible.
        // Un fallo aquí dejaría la aplicación sin arrancar, así que se ignora:
        // sin valores guardados, `.env` sigue mandando.
        try {
            $stored = $this->app->make(IntegrationSettings::class)->stored();
        } catch (Throwable) {
            return;
        }

        foreach ($stored as $key => $value) {
            $definition = IntegrationSettingDefinitions::get($key);

            if ($definition === null) {
                continue;
            }

            config([$definition['config_key'] => $value]);
        }
    }
}
