# Fase 4: propuesta de despacho balanceada

**Fecha:** 2026-07-29  
**Rama:** `agent/fase-4-propuesta-despacho-2026-07-29`  
**Objetivo:** convertir el tablero de custodia en una sugerencia operativa revisable por administración, sin automatizar el despacho.

## Alcance implementado

- Se agregó `POST /api/routes/dispatch-proposals/preview` con permiso `shipments.assign`.
- La operación es de solo lectura: no crea rutas, paradas, asignaciones, cambios de estado ni eventos de custodia.
- El operador puede enviar pilotos, paquetes concretos o filtros de zona, ciudad, tamaño y búsqueda.
- Solo se consideran paquetes `in_warehouse`, con último custodio `hub` y sin una parada pendiente en una ruta operativa abierta del día.
- Los paquetes solicitados que ya no cumplen esas condiciones se informan en `excluded_requested_shipment_ids`; no se fuerzan en una ruta.
- La respuesta separa propuestas por piloto, paquetes sin capacidad y totales para que la revisión humana sea explícita.
- `/rutas` permite seleccionar paquetes de custodia y varios pilotos, consultar la propuesta y revisar la secuencia, capacidad y advertencias sin confirmar el despacho.

## Criterios de propuesta

La heurística determinista aplica este orden:

1. Coincidencia entre la zona del paquete y la zona del piloto.
2. Menor cantidad ya propuesta para mantener balance.
3. Menor distancia desde el origen recibido o la última ubicación conocida del piloto.
4. Identificador del piloto como desempate estable.

Después de repartir, las paradas con coordenadas se ordenan con el fallback local de rutas. Las que no tienen coordenadas quedan al final y se muestran como advertencia. El algoritmo no decide por el operador: solo propone y deja visible qué debe revisarse.

## Capacidad provisional

Todavía no existe una capacidad configurable por piloto. Para no ocultar esa limitación, la respuesta marca `capacity.source = vehicle_default` y usa estos valores provisionales:

| Vehículo | Capacidad estimada |
| --- | ---: |
| Bicicleta | 12 |
| Moto | 25 |
| Carro, camioneta o automóvil | 60 |
| Otro/no definido | 25 |

La capacidad disponible descuenta las paradas pendientes de rutas `planned` o `active` del día. `max_packages_per_driver` permite al operador imponer un límite menor durante la revisión.

## Invariantes de seguridad

- Una previsualización nunca modifica `routes`, `route_stops`, `shipments` ni `custody_events`.
- Una guía con último custodio distinto de `hub` no entra en la propuesta.
- Una guía que ya tiene una parada pendiente en una ruta abierta no entra en la propuesta.
- Pilotos `inactive` no se aceptan; solo se proponen pilotos `active` o `route`.
- La transferencia sede → piloto continúa siendo una acción posterior, manual o por escaneo, con idempotencia.

## Validación realizada

- `RouteTest`: **21/21** pruebas correctas, **129** aserciones.
- Se cubrió balance entre dos pilotos, límite de capacidad, paquetes sin asignar y ausencia de escrituras en rutas/custodia.
- `php -l api/app/Http/Controllers/Api/RouteController.php`: correcto.
- `git diff --check`: correcto.
- Playwright de rutas: **11/11** pruebas correctas, incluida la interacción visual de propuesta.
- Frontend lint, typecheck y build: correctos.

## Pendiente de la siguiente iteración

1. Permitir confirmar manualmente una propuesta y construir el manifiesto de despacho.
2. Integrar el contador de paquetes aceptados por el piloto mediante escaneo.
3. Sustituir la capacidad provisional por un campo administrable y auditable por piloto.
4. Ejecutar UAT en producción después de que cPanel tenga este commit desplegado.
