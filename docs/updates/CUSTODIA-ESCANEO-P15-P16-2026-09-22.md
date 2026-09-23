# Custodia por escaneo entre P15 y P16 — 22/09/2026

Estado: implementado y verificado localmente; sin commit, publicación ni APK nueva. Se conservaron los cambios anteriores. WhatsApp/P18 permanece pausado y la clave de Maps no se modificó.

## Regla operativa y experiencia

La localidad y la asignación previa son información: un piloto puede tomar físicamente un paquete de otra localidad o asignado a otro piloto. El cambio real de custodio queda registrado y genera revisión para administración. Se mantienen las restricciones de paquetes terminales y movimientos incompatibles con una salida activa; una devolución de esa salida exige finalizarla primero.

1. «Tomar paquetes» abre el flujo común, también desde la antigua entrada «Recibir despacho».
2. El escáner permanece disponible y forma una lista numerada, con paquetes chuleados por defecto. También admite código escrito. Validar un código no mueve custodia.
3. Un mismo paquete leído como QR y como código visible se cuenta una sola vez. Máximo 50 paquetes por lote.
4. El piloto desmarca errores y confirma únicamente los seleccionados; por ejemplo, 24 escaneados y 23 chuleados producen 23 resultados de toma.
5. La respuesta muestra aceptados y rechazados individualmente. Los desmarcados conservan su custodia.
6. «Devolver a bodega» aplica el mismo patrón, con motivo de devolución. Registra piloto anterior, usuario, hora del servidor, hora informada por el dispositivo, código, dispositivo y GPS real cuando está disponible.
7. Administración recibe las revisiones con nombres de pilotos y motivo. La confirmación de bodega verifica que esa devolución siga siendo la custodia vigente.

## Fallos corregidos

| Hallazgo | Corrección |
| --- | --- |
| Validación y confirmación discrepaban sobre asignaciones y estados | Criterio común de recepción; localidad/asignación no bloquean |
| Transferir un paquete ya entregado a otro piloto intentaba una transición de estado inválida | Movimiento real de custodio sin repetir una transición al mismo estado |
| Un paquete terminal podía aceptarse por tener una parada abierta | Verificación terminal antes de aceptar o correlacionar la ruta |
| Dos formatos del mismo paquete inflaban el lote | Deducción por identidad en app y control por paquete en API |
| La app podía anunciar devolución exitosa sin aceptación real, incluso con fallback de 404 | Eliminación del éxito ficticio; comprobación del resultado completo por código |
| Reintentar reutilizaba una llave con hora/GPS diferentes | Solicitud congelada y guardada antes de enviar; recuperación tras recarga y misma llave/cuerpo |
| Resultado de idempotencia y movimientos podían quedar separados | Transacción de lote con resultado atómico y savepoints por paquete |
| GPS ausente se sustituía por coordenadas fijas | Coordenadas nulas; pareja de coordenadas validada cuando existe |
| Hora del teléfono podía alterar el orden de custodia | Hora del servidor autoritativa; hora del dispositivo conservada como metadato |
| Una confirmación tardía de bodega podía pisar una nueva toma | Comparación con el evento actual y rechazo `custody_changed` |
| Devoluciones desaparecían del cierre al retirar la asignación o eliminar una ruta vacía | Conteo por eventos del piloto anterior y custodia actual; inclusión de pilotos con movimientos del día |
| Guardar custodia y consultar la ruta disparaban geocodificación externa, agotando 30 segundos | El guardado sin cambios de dirección omite reparación; GET operativo conserva normalización local sin consultar proveedor |
| HTTP 200 con `confirmed:false` podía parecer éxito en el panel | Contrato explícito y limpieza del resultado anterior; éxito dentro del modal sin toast verde persistente |

La geocodificación explícita de creación, edición y optimización conserva su flujo. No se cambió ninguna credencial de Maps. Se eliminaron pantallas duplicadas de toma/devolución y se compartieron lista, selección, resultados y recuperación.

## Contrato y archivos principales

- P15: `components/CustodyBatchScreen.tsx`, `lib/custody-batch.ts`, wrappers de tomar/devolver/recibir y accesos del inicio.
- P16: `DriverReceptionService`, `DriverReturnService`, `CustodyBatch`, `DayCloseService`, modelo `Shipment`, `ShipmentGeodataService` y lecturas operativas de `RouteController`.
- Nuevo `POST /api/driver/returns/validate`: lectura de elegibilidad y datos del paquete; sin mutación.
- Recepción y devolución conservan endpoints existentes, autenticación del piloto y `Idempotency-Key`. Coordenadas admiten nulos. Una llave con otro contenido se rechaza.
- Confirmación de bodega: el consumidor debe comprobar `confirmed === true`; `not_found`, `no_pending_return` y `custody_changed` son rechazos operativos.
- El diario local de solicitud pendiente se separa por API, usuario, piloto y operación; fragmentos compatibles con SecureStore. Una lista todavía no enviada no es custodia ni un borrador persistente.
- No se añadieron migraciones ni dependencias. La API actualizada debe publicarse antes de distribuir la app que usa la validación de devoluciones.

## Evidencia ejecutada

| Verificación | Resultado |
| --- | --- |
| Regresión backend: custodia, despacho, cierre, envíos, rutas, geocodificación y endpoints acotados | 152 pruebas; 977 aserciones |
| Repetición focalizada después de ajustes finales | 26 pruebas; 175 aserciones |
| P15 en copia aislada con dependencias del lockfile | 20 pruebas aprobadas, incluidas cinco de custodia |
| TypeScript P15 y P16; ESLint de archivos del panel | Aprobados |
| Exportación Expo final para web y Android | Correcta; Android 1516 módulos, bundle Hermes de 3,7 MB |
| Navegador móvil de 390 × 900 contra API real aislada, SQLite nuevo y 28 paquetes sintéticos | Cuatro recorridos aprobados, sin errores JavaScript |
| Panel real contra la misma API | Tres comprobaciones aprobadas |

El recorrido final verificó 24 lecturas, alias QR duplicado, 23 seleccionados y uno intacto en sede; devolución parcial tras transferencia concurrente entre validación y confirmación; pérdida simulada de respuesta, recarga y reintento con exactamente la misma solicitud y un solo evento; cierre con 22 paquetes en moto y una devolución. El panel confirmó la recepción en sede y rechazó la segunda confirmación sin conservar un éxito anterior. Se revisaron capturas.

Se usaron exclusivamente servidores de QA en 8037, 8087 y 8097, SQLite sintético separado y pruebas en memoria. No se reiniciaron servicios compartidos ni se modificó la base operativa. Las evidencias HTTP, capturas y resultados están en la carpeta `outputs` de la tarea Codex del 21/09/2026, con prefijo `custodia-`; tokens sintéticos solo en `work`, fuera del informe.

## Límites y aceptación pendiente

- Falta probar cámara, permisos, lectura repetida y suspensión/reapertura en Android físico: `adb devices` no mostró dispositivos. Navegador usó códigos introducidos por el mismo manejador de escaneo y validó también el token QR real en API.
- Exportar JavaScript/Hermes no es construir, instalar ni validar un APK.
- No se ejecutó prueba de contención simultánea bajo MySQL/MariaDB de producción. Bloqueos y transacciones se verificaron en pruebas y API SQLite aisladas.
- Las dependencias operativas de P15 no se reinstalaron: tres pruebas Metro del trabajo anterior fallan con ese `node_modules` antiguo; las 20 pasan en la copia aislada ajustada al lockfile. Las cinco pruebas nuevas de custodia también pasan en el árbol operativo.
- Solicitudes antiguas que ya estuvieran atascadas como `processing` requieren diagnóstico individual; no se liberan automáticamente porque podría duplicar movimientos.
- Antes de publicar: validar el recorrido en Android físico y en el motor de base de datos del entorno destino, revisar el conjunto de cambios locales y desplegar API antes que app. No se ha publicado esta implementación.
