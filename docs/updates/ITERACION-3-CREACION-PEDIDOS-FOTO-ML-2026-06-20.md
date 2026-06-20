# Iteración 3 — Creación de pedidos con foto, Mercado Libre y campos claros

Fecha: 2026-06-20  
Rama: `dev`  
Alcance: API de pedidos y formulario móvil del panel administrativo

## Bugs auditados

1. Al crear un pedido con foto del paquete, el pedido no se podía subir.
2. Al crear un pedido con tipo de pago `Mercado Libre`, el pedido podía fallar o quedar con datos financieros ambiguos.
3. En el formulario de creación, los nombres de los campos estaban solo como placeholder; al escribir, desaparecía la referencia de qué dato iba en cada campo.

## Diagnóstico

- La API guardaba `intake_photo` en la ruta `public/intake` usando el disco por defecto. Eso podía terminar en almacenamiento privado o rutas inconsistentes según el entorno.
- El formulario enviaba fotos originales del celular. En móviles, esas fotos pueden superar fácilmente el límite backend de 5 MB.
- `Mercado Libre` no debe cobrar valor COD al destinatario, pero el formulario podía conservar un valor previo en `cod_amount`.
- Los placeholders no son suficientes para operación móvil porque desaparecen cuando el usuario escribe.

## Corrección aplicada

### Backend

- `POST /api/shipments` y `PUT /api/shipments/{shipment}` ahora guardan `intake_photo` explícitamente en el disco `public`.
- Las URLs nuevas quedan bajo `/storage/intake/...`.
- Se agregó normalización financiera:
  - si `payment_type !== cash_on_delivery`, entonces `cod_amount = 0`;
  - esto cubre `mercado_libre`, `post_sale` y `prepaid`.

### Frontend

- El formulario de `Nuevo pedido` ahora muestra títulos fijos encima de los campos principales.
- Al seleccionar `Mercado Libre`, el campo de cobro al entregar queda en `0` y deshabilitado.
- La foto se optimiza antes de enviarse:
  - máximo visual aproximado: 1600 px por lado;
  - conversión a JPEG;
  - límite cliente: 4 MB para evitar rechazos del backend;
  - preview estable sin crear URLs nuevas en cada render.

## Archivos modificados

- `api/app/Http/Controllers/Api/ShipmentController.php`
- `api/tests/Feature/ShipmentTest.php`
- `frontend/src/app/(admin)/pedidos/page.tsx`

## Pruebas agregadas

- Crear pedido `mercado_libre` y confirmar `cod_amount = 0`.
- Crear pedido con `intake_photo` y confirmar almacenamiento en disco `public`.

## Validación ejecutada

```bash
LOG_CHANNEL=null ./vendor/bin/phpunit --filter create --do-not-cache-result tests/Feature/ShipmentTest.php
```

Resultado: 3 pruebas, 16 aserciones, OK.

```bash
npx tsc --noEmit --incremental false
```

Resultado: OK.

```bash
npx eslint -- "src/app/(admin)/pedidos/page.tsx" "src/lib/api.ts"
```

Resultado: OK.

```bash
git diff --check
php -l api/app/Http/Controllers/Api/ShipmentController.php
php -l api/tests/Feature/ShipmentTest.php
```

Resultado: OK.

## Autoauditoría de omisiones

- La suite completa `tests/Feature/ShipmentTest.php` aún tiene fallos históricos en pruebas de borrado (`delete`/`forceDelete`) que no pertenecen a esta iteración.
- Falta validar visualmente en navegador real móvil una foto grande tomada desde cámara.
- Falta confirmar en producción que `php artisan storage:link` esté aplicado para servir `/storage/intake/...`.
- Queda pendiente la revisión de dashboard con métricas en cero y optimización responsive general del panel móvil.

