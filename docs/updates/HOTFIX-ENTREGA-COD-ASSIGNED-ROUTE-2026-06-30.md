# Hotfix — entrega COD desde ruta asignada

Fecha: 2026-06-30  
Repo: `P16-DHE-Admin-Web`  
Rama local al aplicar: `main`
Commit produccion: `5fb489d fix(api): allow assigned route cod delivery`

## Síntoma reportado

En la app piloto, al intentar cerrar la entrega del pedido `#DHE00004`, aparecía:

- `Error del servidor en /shipments/12/status`
- Luego la pantalla de pedidos mostraba:
  - `Ruta: Error del servidor en /driver/my-route`

## Causa probable confirmada

La app piloto envía primero:

```http
POST /api/shipments/{id}/status
status=delivered
cod_collected_amount=...
cod_payment_method=...
```

Si el pedido todavía estaba en estado `assigned_to_route`, el backend intentaba aplicar:

```text
assigned_to_route -> delivered
```

Pero el enum de estados solo permite:

```text
assigned_to_route -> in_transit -> delivered
```

Eso lanzaba una excepción de transición inválida y terminaba como error `500`.

## Corrección aplicada

Cuando el backend recibe `status=delivered` para un pedido todavía `assigned_to_route`, normaliza primero:

```text
assigned_to_route -> in_transit
```

Y luego aplica:

```text
in_transit -> delivered
```

Ambos pasos quedan registrados como eventos auditables.

## Alcance

La corrección es limitada:

- Solo aplica cuando el destino es `delivered`.
- Solo aplica cuando el estado actual es `assigned_to_route`.
- No relaja transiciones para pedidos `registered`, `confirmed`, `cancelled`, `returned` o `delivered`.
- Mantiene registro de recaudo COD (`cod_collected_amount`, `cod_payment_method`, `cod_collected_at`).

## Validación

Pruebas ejecutadas:

```powershell
php -l api/app/Http/Controllers/Api/ShipmentController.php
php -l api/tests/Feature/ScopedEndpointTest.php
LOG_CHANNEL=null vendor/bin/phpunit --do-not-cache-result tests/Feature/ScopedEndpointTest.php --filter "deliver"
LOG_CHANNEL=null vendor/bin/phpunit --do-not-cache-result tests/Feature/ScopedEndpointTest.php tests/Feature/RouteTest.php tests/Feature/ShipmentTest.php
LOG_CHANNEL=null vendor/bin/phpunit --do-not-cache-result
```

Resultados:

- Test focalizado: `2` pruebas verdes.
- Rutas/pedidos/scope: `43` pruebas verdes.
- Suite completa backend: `215` pruebas, `758` aserciones verdes.

## Pendiente después de deploy

Probar en celular:

1. Abrir pedido `#DHE00004` o uno QA en estado asignado a ruta.
2. Ingresar recaudo COD.
3. Adjuntar foto si aplica.
4. Tocar `Entregar`.
5. Confirmar que no aparece `Error del servidor`.
6. Confirmar que la ruta vuelve a cargar sin error.

## Documentacion canonica actualizada

- `docs/CHANGELOG.md`: registra el hotfix y la validacion backend.
- `docs/API-CONTRACTS.md`: documenta la compatibilidad movil para `assigned_to_route -> in_transit -> delivered`.
- `docs/ARCHITECTURE.md`: agrega el flujo de integracion entre app piloto, ruta activa y cierre de parada.
