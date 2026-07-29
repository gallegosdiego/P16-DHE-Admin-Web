# Fase 1: ingreso y custodia en sede

**Fecha:** 28 de julio de 2026  
**Rama:** `agent/fase-1-ingreso-custodia-2026-07-28`  
**Estado:** implementado localmente; pendiente UAT visual y despliegue

## Objetivo

Dejar una primera operación vertical y trazable para el paquete que llega directamente a una sede Danhei:

```text
usuario de sesión registra
        ↓
cliente/remitente + destinatario
        ↓
receptor físico opcional
        ↓
guía DH + lote de recepción
        ↓
custodia en sede
```

## Cambios implementados

- El formulario de **Nuevo ingreso** queda enfocado en recepción en sede; los otros `IntakeMode` siguen disponibles en la API para no romper integraciones.
- La pantalla ya no muestra **Administrar sedes** como acción del ingreso; la administración queda en **Configuración > Sedes operativas**.
- La sesión actual se conserva como actor de auditoría. Un empleado habilitado puede seleccionarse como receptor físico alterno por teléfono o nombre.
- `pickup_batches.received_by` y la tarea de mostrador quedan asociados al receptor físico; los cambios de estado, custodia y auditoría conservan al usuario que ejecutó la operación.
- Se agregó `GET /api/pickup-intakes/receivers`, protegido por `intakes.receive`, sin exponer el catálogo general de usuarios.
- Las sedes admiten edición administrativa y generación automática de código interno (`HUB-*` o `PTO-*`). El nombre permanece como etiqueta visible.
- El ingreso registra tamaño `small`, `medium` o `large`, conserva el campo interno `size_code` y ofrece modalidades visuales para contraentrega, prepago y Mercado Libre Flex usando los campos financieros existentes.
- Al completar el ingreso se muestran las guías generadas y se habilita la impresión de cada desprendible.

## Contratos preservados

- Se conserva `POST /api/pickup-intakes/walk-in/complete`, su encabezado `Idempotency-Key`, la transacción única y el materializador de envíos.
- No se eliminan ni renombraron campos internos existentes; los textos de modalidad son de presentación.
- `PickupReceptionService::start` conserva sus tres argumentos anteriores y agrega el receptor físico como argumento opcional.
- No se agregó una migración: `size_code`, `payment_type`, `received_by`, tareas y lotes ya existían en la base operativa.

## Verificación ejecutada

- `php artisan test`: **394/394** pruebas, **1990** aserciones.
- `php artisan test --filter=UnifiedIntakeApiTest`: **9/9**.
- `php artisan test --filter=PickupIntakeApiTest`: **8/8**.
- `php -l` en los cuatro archivos PHP modificados: sin errores.
- `npm run lint`: correcto.
- `npx tsc --noEmit --incremental false`: correcto.
- `npm run build`: correcto con Next.js 16.2.6.

## Pendiente antes de producción

1. Desplegar API y frontend juntos en una ventana controlada.
2. Ejecutar UAT visual en móvil y escritorio con un usuario operador y un receptor alterno.
3. Confirmar en producción que las guías impresas contienen los datos acordados de remitente, destinatario, cobro y custodia.
4. Continuar con la Fase 2: propuesta de agrupación por localidad, jornadas y despacho/escaneo del piloto.
