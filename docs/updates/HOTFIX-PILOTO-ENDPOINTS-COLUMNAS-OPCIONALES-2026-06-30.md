# Hotfix — endpoints piloto con columnas opcionales

Fecha: 2026-06-30  
Repo: `P16-DHE-Admin-Web`  
Rama local al aplicar: `main`

## Síntoma reportado

En la app piloto, después del despliegue del hotfix de entrega COD, el dashboard de Juan mostraba:

- `Ruta: Error del servidor en /driver/my-route`
- `Pedidos: Error del servidor en /driver/assigned-shipments`
- Banner adicional de la app: `Sin conexión a internet`

El mensaje de conexión es secundario: la app móvil muestra ese estado cuando no puede completar los fetches principales, pero el detalle operativo venía de errores `500` en backend.

## Causa probable corregida

Los endpoints móviles seleccionaban columnas agregadas en migraciones posteriores al esquema base:

- `intake_photo`
- `recipient_lat`
- `recipient_lng`

Si producción no tenía alguna de esas columnas, MySQL podía responder `Unknown column` y tumbar ambos endpoints, porque `/driver/my-route` y `/driver/assigned-shipments` comparten el mismo serializador de envíos.

## Corrección aplicada

- `RouteController` ahora selecciona `intake_photo`, `recipient_lat` y `recipient_lng` solo si existen en `shipments`.
- El payload móvil mantiene esas claves y responde `null` cuando la columna no existe, evitando romper la app.
- `deploy-check` ahora expone `database.driver_mobile_optional_columns` para diagnosticar rápidamente si producción tiene esas columnas.

## Validación local

Pruebas ejecutadas:

```powershell
php -l app/Http/Controllers/Api/RouteController.php
php -l tests/Feature/ScopedEndpointTest.php
LOG_CHANNEL=null vendor/bin/phpunit --do-not-cache-result tests/Feature/ScopedEndpointTest.php --filter test_driver_mobile_endpoints_survive_missing_optional_app_columns
LOG_CHANNEL=null vendor/bin/phpunit --do-not-cache-result tests/Feature/ScopedEndpointTest.php
LOG_CHANNEL=null vendor/bin/phpunit --do-not-cache-result tests/Feature/RouteTest.php
```

Resultados:

- Test focal nuevo: `1` prueba, `14` aserciones verdes.
- Scope móvil completo: `21` pruebas, `77` aserciones verdes.
- Rutas: `11` pruebas, `36` aserciones verdes.

## Prueba post-deploy en celular

1. Abrir app piloto con usuario Juan.
2. Tocar `Sincronizar`.
3. Confirmar que desaparecen los errores:
   - `/driver/my-route`
   - `/driver/assigned-shipments`
4. Confirmar que el dashboard muestra ruta activa o pedidos asignados.
5. Si todavía aparece `Sin conexión a internet`, validar conectividad real del teléfono y volver a sincronizar.
