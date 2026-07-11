# Entrega piloto tolerante a dependencias opcionales

Fecha: 2026-07-11

## Incidente

La app del piloto recibia `Error interno del servidor.` al finalizar un pedido,
con o sin foto de evidencia. El error ocurria en el backend despues de iniciar
la transicion a `delivered`.

## Causa

Los observadores del envio y de la ruta ejecutaban consultas y escrituras de
WhatsApp y notificaciones dentro del flujo operativo. Si produccion no tenia
las tablas opcionales `pickup_packages`, `notifications` o `jobs`, la excepcion
revertia la entrega y la parada quedaba pendiente.

## Correccion

- La integracion de WhatsApp se omite si `pickup_packages` no existe.
- Los errores de WhatsApp se registran sin bloquear la entrega.
- Las notificaciones de ruta se omiten si `notifications` no existe.
- Los errores de notificacion se registran sin revertir el cierre de ruta.
- Se agrego una prueba de entrega COD por 45.000 que elimina esas tablas antes
  de confirmar y verifica envio entregado, recaudo y parada completada.

La entrega, el recaudo y la parada siguen siendo la operacion prioritaria. Las
notificaciones y su cola son efectos secundarios recuperables.
