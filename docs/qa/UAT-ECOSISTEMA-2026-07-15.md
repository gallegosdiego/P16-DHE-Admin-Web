# UAT integral del ecosistema Danhei

**Fecha:** 15 de julio de 2026

**Estado:** activo; pendiente de ejecución

**Alcance:** P14 cliente, P16 admin/API y P15 piloto

## Identificación de la ejecución

| Dato | Valor |
|---|---|
| Ambiente | |
| Commit P14 | |
| Commit P15 | |
| Versión/versionCode APK | |
| Commit P16 | |
| Fecha y responsable | |
| Cliente/piloto QA | |

## 1. Solicitud e ingreso

- [ ] P14 crea recogida en local.
- [ ] P14 crea entrega planificada en sede.
- [ ] P16 crea ingreso espontáneo.
- [ ] Un reintento con la misma llave no duplica solicitud ni paquetes.
- [ ] P16 materializa las guías esperadas.

## 2. Ejecución física

- [ ] P16 asigna a piloto y P15 recibe la tarea.
- [ ] Recogida completa genera lote y custodia.
- [ ] Faltante/rechazado conserva diferencias.
- [ ] Recolector autorizado puede entregar a una sede.
- [ ] Recepción directa en sede no crea ruta ni pago ficticio de piloto.

## 3. Ruta, entrega y devolución

- [ ] Ruta con entrega y tarea operativa mixta.
- [ ] Entrega COD con evidencia.
- [ ] Novedad con causal.
- [ ] Devolución a sede/cliente y custodia final.
- [ ] Reintento no duplica intento, recaudo ni cierre.

## 4. Conciliación financiera

- [ ] La entrega crea obligación COD del piloto.
- [ ] La entrega crea causación del servicio aprobada.
- [ ] El cliente muestra COD reportado, todavía no disponible.
- [ ] Abono parcial del piloto se asigna por guía.
- [ ] Solo el monto recibido queda disponible al cliente.
- [ ] Pago parcial al piloto no reduce su obligación COD.
- [ ] Transferencia parcial al cliente no supera lo disponible.
- [ ] P15, P16 y P14 muestran totales coherentes.
- [ ] IDs duplicados, remanentes sin aplicar y doble envío son rechazados después de implementar FIN-06.

## 5. Seguridad y auditoría

- [ ] Cliente no accede a datos de otro cliente.
- [ ] Piloto no opera tareas de otro piloto.
- [ ] Usuario sin permiso no registra pagos ni cambios de sede.
- [ ] Movimientos sensibles aparecen en auditoría.
- [ ] No se exponen secretos ni datos internos en errores.

## 6. Evidencia y cierre

- [ ] Capturas o video de los recorridos críticos.
- [ ] IDs de solicitudes, guías, tareas, lotes y movimientos financieros.
- [ ] Exportaciones/comprobantes cuando estén implementados.
- [ ] Incidencias clasificadas P0, P1 o P2.
- [ ] Aprobación explícita del responsable de QA.

## Criterio de salida

El núcleo puede declararse listo únicamente cuando no existan fallos P0/P1, FIN-01 a FIN-06 estén cerrados y una APK nueva haya completado el recorrido integral en Android real.
