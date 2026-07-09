# Iteracion 65 - Formulario de pedidos robusto

Fecha: 2026-07-09
Repositorio: `P16-DHE-Admin-Web`

## Objetivo

Corregir dos frentes del alta de pedidos desde el panel:

- fricción al editar montos con `0` inicial pegado;
- mayor robustez del flujo nuevo de direcciones estructuradas.

## Cambios aplicados

### 1. Inputs monetarios más cómodos

En `Pedidos > Crear envío`:

- `Costo del envío`
- `Valor a cobrar al entregar`
- `Pago al piloto`

ahora usan un draft numérico controlado:

- seleccionan todo al enfocar;
- escribir reemplaza el valor previo;
- el `0` inicial deja de obligar a borrar manualmente;
- al salir del campo, el valor se normaliza.

### 2. Builder de dirección alineado con backend

El constructor guiado ahora limita longitudes según validación backend:

- tokens y sufijos: `20`
- complemento: `80`
- barrio: `80`
- referencia: `160`

Esto evita errores visuales y rechazos evitables desde el panel.

### 3. Persistencia segura de dirección larga

El backend ahora:

- conserva completa la metadata estructurada en `recipient_address_meta`;
- y recorta solo el campo persistido `recipient_address` cuando complemento + barrio harían exceder el límite de almacenamiento.

## Cobertura agregada

- prueba `multipart/form-data` igual al flujo real del panel;
- prueba de truncamiento seguro sin perder metadata.

## Validación ejecutada

- `php artisan test --filter=ShipmentTest`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Resultado esperado en QA

- al tocar el monto COD, escribir reemplaza el `0` automáticamente;
- el panel deja de rechazar entradas largas por desalineación tonta entre UI y backend;
- la creación de pedidos con dirección guiada queda más estable y más cercana al flujo real de operación.
