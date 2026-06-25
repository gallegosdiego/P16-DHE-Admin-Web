# Iteracion COD app piloto - 2026-06-25

## Resumen

Se corrigio el flujo donde la app piloto no podia registrar el monto real de un pedido contra entrega y podia mostrar `Server Error` al intentar entregar.

## Evidencia reportada

- Inicio app piloto: banner `Server Error`.
- Pedidos: banner `Server Error`.
- Detalle de parada COD: modal `Recaudo contra entrega` mostraba `$0` sin campo para ingresar monto.
- Lista de pedidos: algunos COD aparecian como `COD $0`.

## Diagnostico

El flujo anterior hacia dos operaciones separadas:

1. `POST /api/financial/shipments/{id}/collect`
2. `POST /api/shipments/{id}/status` con `status = delivered`

Ese primer endpoint pertenece al modulo financiero y esta dentro del grupo que requiere `financial.view`. El rol piloto puede tener `financial.collect`, pero no debe necesitar ni recibir permisos de vista financiera para entregar un paquete. Esa combinacion hacia fragil la entrega COD desde movil.

Ademas, el modelo solo tenia `cod_amount`, que representa el monto esperado o creado en el pedido. No existia un campo explicito para guardar el monto realmente cobrado por el piloto cuando el pedido llega con COD en cero.

## Solucion implementada

### Backend API

- Nueva migracion:
  - `cod_collected_amount`
  - `cod_payment_method`
  - `cod_collected_at`
- `Shipment` ahora expone y castea esos campos.
- `ShipmentController::changeStatus()` acepta `cod_collected_amount` y `cod_payment_method`.
- Si el pedido COD se entrega, queda `financial_status = collected`.
- Si el pedido fue creado con `cod_amount = 0` y el piloto reporta monto real, tambien se actualiza `cod_amount` para conservar compatibilidad con reportes actuales.
- `RouteController::myRoute()` retorna los nuevos campos a la app piloto.
- `RouteController::completeStop()` conserva el fallback de marcar COD como cobrado cuando una parada se completa directamente.
- `FinancialController::markCollected()` acepta los nuevos campos para operaciones administrativas.

### App movil

- El modal COD permite digitar monto y elegir medio de pago.
- La app exige monto mayor que cero antes de confirmar entrega.
- La entrega COD envia monto y metodo en `POST /api/shipments/{id}/status`.
- La app deja de llamar `/api/financial/shipments/{id}/collect`.
- Los totales de recaudo usan `cod_collected_amount ?? cod_amount`.
- Los errores 500 muestran el endpoint afectado para facilitar soporte en produccion.

## Pruebas ejecutadas

Backend:

```bash
php artisan test --do-not-cache-result --filter=ScopedEndpointTest
php artisan test --do-not-cache-result --filter=FinancialTest
php artisan test --do-not-cache-result --filter=FinancialEdgeCaseTest
php artisan test --do-not-cache-result --filter=RouteTest
```

Mobile:

```bash
npx tsc --noEmit --incremental false
```

## Orden seguro de despliegue

1. Desplegar backend P16.
2. Correr migraciones.
3. Publicar/instalar APK P15 `4.2.3`.
4. Validar con un pedido COD `cod_amount = 0`.
5. Validar con un pedido COD con monto esperado.
6. Revisar panel financiero/admin para confirmar que el recaudo queda visible.

## Riesgo residual

Si produccion sigue mostrando `Server Error` despues del despliegue, la app 4.2.3 mostrara el endpoint exacto. Con ese dato se debe revisar el log Laravel del API para determinar si es un problema de datos, migracion pendiente o permisos.
