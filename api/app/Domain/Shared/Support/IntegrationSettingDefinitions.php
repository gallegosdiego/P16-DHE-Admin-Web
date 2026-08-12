<?php

namespace App\Domain\Shared\Support;

/**
 * Catálogo de las credenciales administrables desde el panel.
 *
 * La lista es cerrada a propósito: solo estas claves pueden escribirse. Si el
 * endpoint aceptara cualquier nombre, quien tuviera acceso podría sobrescribir
 * configuración arbitraria de Laravel —incluido el driver de base de datos o el
 * de correo— y convertir un permiso de configuración en ejecución remota.
 *
 * `config_key` es la ruta que YA usa el código (`config('services.google.maps_key')`).
 * El proveedor superpone el valor guardado sobre esa ruta, así que los
 * consumidores no cambian.
 */
class IntegrationSettingDefinitions
{
    /**
     * @return array<string, array{
     *     group: string,
     *     label: string,
     *     config_key: string,
     *     secret: bool,
     *     help: string
     * }>
     */
    public static function all(): array
    {
        return [
            'google.maps_key' => [
                'group' => 'Google Maps',
                'label' => 'Clave de API',
                'config_key' => 'services.google.maps_key',
                'secret' => true,
                'help' => 'Geocodificación y optimización de rutas. Sin ella el sistema usa Nominatim como alternativa. Restríngela por paquete Android y huella SHA-1 en Google Cloud Console.',
            ],
            'whatsapp.app_secret' => [
                'group' => 'WhatsApp',
                'label' => 'Meta App Secret',
                'config_key' => 'services.whatsapp.app_secret',
                'secret' => true,
                'help' => 'Valida la firma de los webhooks entrantes de Meta.',
            ],
            'whatsapp.verify_token' => [
                'group' => 'WhatsApp',
                'label' => 'Token de verificación',
                'config_key' => 'services.whatsapp.verify_token',
                'secret' => true,
                'help' => 'El que Meta envía al dar de alta el webhook.',
            ],
            'whatsapp.access_token' => [
                'group' => 'WhatsApp',
                'label' => 'Token de acceso',
                'config_key' => 'services.whatsapp.access_token',
                'secret' => true,
                'help' => 'Permite enviar mensajes por la Cloud API.',
            ],
            'whatsapp.phone_number_id' => [
                'group' => 'WhatsApp',
                'label' => 'ID del número',
                'config_key' => 'services.whatsapp.phone_number_id',
                'secret' => false,
                'help' => 'Identificador del número emisor en la Cloud API.',
            ],
            'google.default_recipient_city' => [
                'group' => 'Operación',
                'label' => 'Ciudad por defecto',
                'config_key' => 'services.google.default_recipient_city',
                'secret' => false,
                'help' => 'Se asume cuando un envío no indica ciudad.',
            ],
        ];
    }

    public static function has(string $key): bool
    {
        return array_key_exists($key, self::all());
    }

    /**
     * @return array{group: string, label: string, config_key: string, secret: bool, help: string}|null
     */
    public static function get(string $key): ?array
    {
        return self::all()[$key] ?? null;
    }

    public static function isSecret(string $key): bool
    {
        return (bool) (self::get($key)['secret'] ?? true);
    }
}
