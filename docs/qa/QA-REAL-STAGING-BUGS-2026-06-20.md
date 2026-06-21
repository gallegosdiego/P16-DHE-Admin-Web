# QA real/staging — bugs app piloto + panel administrativo

Fecha: 2026-06-20  
Rama validada: `dev`  
Repos involucrados:

- `P16-DHE-Admin-Web` — API Laravel + panel administrativo.
- `P15-DHE-App-Repartidor` — app móvil del piloto.

## Objetivo

Convertir los bugs reportados en una prueba real, repetible y auditable antes de mover cambios hacia `main`.

## Alcance seguro ejecutado

Se ejecutó smoke público no destructivo contra producción:

| Plataforma | URL | Resultado |
|---|---|---|
| API health | `https://api.danheiexpress.com/api/health` | `200 OK` |
| API deploy-check | `https://api.danheiexpress.com/api/deploy-check` | `200 OK` |
| Admin web | `https://admin.danheiexpress.com` | `200 OK` |
| Portal cliente | `https://portal.danheiexpress.com` | `200 OK` |
| Landing | `https://www.danheiexpress.com` | `200 OK` |

Comando repetible:

```powershell
.\scripts\qa-public-smoke.ps1
```

## Límite de seguridad

No se ejecutaron pruebas autenticadas ni mutaciones contra producción desde Codex en esta iteración.

Motivo:

- Crear pedidos, asignarlos a Juan, subir fotos, iniciar rutas o cerrar sesión en usuarios reales puede alterar operación viva.
- Esas pruebas deben hacerse con una cuenta/piloto QA o en una ventana controlada de UAT.

## Datos mínimos para UAT autenticado

Crear o confirmar antes de la prueba:

- Piloto QA o Juan autorizado para prueba.
- Usuario de acceso vinculado al piloto.
- Cliente QA.
- Zona QA.
- 3 pedidos QA:
  - Pedido A: `Contra entrega`.
  - Pedido B: `MercadoLibre`.
  - Pedido C: con foto de paquete.
- Ruta QA del día para el piloto.
- Celular Android real con la APK preview instalada.

## Escenarios críticos

### 1. App piloto — safe area inferior

Bug reportado:

- En detalle de parada, los botones inferiores se mezclan con la navegación del celular.

Pasos:

1. Abrir APK en Android real.
2. Iniciar sesión como piloto QA.
3. Entrar a una parada.
4. Revisar botones inferiores: `Novedad` y `Entregar`.
5. Probar con barra de navegación Android visible.
6. Probar con teclado abierto en un campo editable.

Criterio de aceptación:

- Los botones nunca quedan debajo de la navegación del sistema.
- El teclado no tapa acciones críticas.
- Hay espacio visual suficiente al final.

Evidencia requerida:

- Screenshot antes/después.
- Modelo de celular.
- Versión Android.

### 2. Admin móvil — estados en español latino

Bug reportado:

- Estados como `Registered` y `Delivered` aparecen en inglés.

Pasos:

1. Abrir `https://admin.danheiexpress.com/pedidos` en celular.
2. Ver cards de pedidos.
3. Revisar badges de estado.

Criterio de aceptación:

- `Registered` debe mostrarse como `Registrado`.
- `Delivered` debe mostrarse como `Entregado`.
- `In transit` debe mostrarse como `En ruta`.
- No deben quedar estados operativos en inglés.

### 3. Admin móvil — responsive de cards y botones

Bug reportado:

- Panel administrativo en celular requiere optimización de cards, bordes, botones y jerarquía visual.

Pasos:

1. Abrir `/`, `/pedidos`, `/rutas`, `/conductores`.
2. Probar ancho aproximado `360px–430px`.
3. Validar botones: `Detalle`, `Sin acción`, `Eliminar`, `Salir`, búsqueda y notificaciones.

Criterio de aceptación:

- Ningún botón se corta.
- Botones tienen área táctil mínima cercana a `44px`.
- Cards respetan identidad visual y legibilidad.
- No hay elementos tapados por barras del navegador/celular.

### 4. Piloto Juan — logout/login conserva pedidos

Bug reportado:

- Al cerrar sesión y volver a entrar, Juan queda sin pedidos ni ruta.

Pasos:

1. En admin, confirmar que Juan tiene `driver_id` y usuario vinculado.
2. Asignar 2 pedidos QA a Juan o piloto QA.
3. Crear ruta del día.
4. En app piloto, iniciar sesión.
5. Confirmar pedidos/ruta visibles.
6. Cerrar sesión.
7. Volver a iniciar sesión.
8. Confirmar pedidos/ruta visibles nuevamente.

Criterio de aceptación:

- El logout solo limpia token local, no borra asignaciones en servidor.
- `/api/driver/my-route` devuelve la ruta vigente.
- `/api/driver/assigned-shipments` devuelve pedidos asignados aunque ya exista ruta activa.

### 5. Nuevos pedidos asignados aparecen en app abierta

Bug reportado:

- Admin asigna pedidos nuevos a Juan, pero la app no los vuelve a mostrar.

Pasos:

1. Dejar app piloto abierta en `Inicio` o `Pedidos`.
2. Desde admin, crear/asignar pedido QA nuevo al piloto.
3. Refrescar app piloto.
4. Revisar banner de paquetes asignados y lista de paradas.

Criterio de aceptación:

- El pedido asignado aparece sin reinstalar ni limpiar app.
- Si hay ruta activa, aparece como paquete pendiente para agregar a ruta.
- No se requiere cerrar sesión para refrescar datos.

### 6. Crear pedido con foto de paquete

Bug reportado:

- Al adjuntar foto de evidencia/paquete, el pedido no sube.

Pasos:

1. En admin móvil o desktop, abrir creación de pedido.
2. Completar datos mínimos.
3. Adjuntar imagen `.jpg` o `.webp` menor a `5MB`.
4. Guardar.
5. Revisar que el pedido se cree y la foto quede visible/accesible.

Criterio de aceptación:

- El backend acepta `multipart/form-data`.
- `intake_photo` queda guardado con URL `/storage/intake/...`.
- Si falla, muestra error claro y no borra los campos.

### 7. Crear pedido MercadoLibre

Bug reportado:

- Al escoger `MercadoLibre`, el pedido no sube.

Pasos:

1. Crear pedido QA.
2. Seleccionar `MercadoLibre`.
3. No exigir valor COD.
4. Guardar.

Criterio de aceptación:

- Pedido se crea con `payment_type=mercado_libre`.
- `cod_amount=0`.
- No aparece validación errónea de contra entrega.

### 8. Formularios — labels persistentes

Bug reportado:

- Los textos de guía están dentro del input y desaparecen al escribir.

Pasos:

1. Abrir creación/edición de pedido.
2. Tocar cada campo.
3. Confirmar que siempre se sabe qué dato se debe escribir.

Criterio de aceptación:

- Cada campo crítico tiene label visible fuera del input.
- Placeholder se usa solo como ayuda, no como título.
- Al perder foco, el label sigue visible.

### 9. Dashboard — métricas del día

Bug reportado:

- Dos bloques del dashboard funcionaban un día y al siguiente aparecen en cero.

Pasos:

1. Crear/confirmar pedidos QA del día.
2. Abrir dashboard admin.
3. Revisar distribución por estado.
4. Revisar financiero/resumen de caja.
5. Comparar contra `/api/dashboard`.

Criterio de aceptación:

- Si hay pedidos del día, métricas muestran datos del día.
- Si no hay pedidos del día, fallback de actividad reciente se identifica correctamente.
- No hay cero falso cuando sí existen pedidos operativos.

### 10. Soft delete de pedidos

Bug prevenido:

- Borrado permanente o borrado de pedidos en tránsito.

Pasos:

1. Crear pedido `registered`.
2. Eliminarlo desde admin.
3. Confirmar que queda soft-deleted.
4. Intentar eliminar pedido `in_transit`.

Criterio de aceptación:

- Pedido `registered` va a papelera.
- Pedido `in_transit` devuelve error `422`.
- No se pierde trazabilidad operacional.

## Criterios de salida

Para considerar la corrección lista para `main`:

- [ ] Ambos CI remotos verdes en `dev`.
- [ ] Smoke público verde.
- [ ] QA autenticado ejecutado con piloto QA/Juan autorizado.
- [ ] Screenshots adjuntos de app piloto y admin móvil.
- [ ] Pedido con foto creado exitosamente.
- [ ] Pedido MercadoLibre creado exitosamente.
- [ ] Logout/login del piloto conserva pedidos.
- [ ] Nuevos pedidos asignados aparecen en la app.
- [ ] Dashboard refleja datos reales.
- [ ] No se detectan regresiones visuales móviles.

## Resultado de esta iteración

Estado: parcialmente validado.

Validado:

- Infraestructura pública básica responde.
- CI remoto frontend/backend ya existe y pasó previamente en `dev`.
- Los escenarios quedan documentados paso a paso.

Pendiente:

- UAT autenticado en celular real.
- Mutaciones controladas con datos QA.
- Evidencia visual final.
