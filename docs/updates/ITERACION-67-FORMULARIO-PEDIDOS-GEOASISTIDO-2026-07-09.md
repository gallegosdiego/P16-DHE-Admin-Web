# Iteracion 67 - Formulario de pedidos geoasistido

Fecha: 2026-07-09  
Repositorio: `P16-DHE-Admin-Web`

## Objetivo

Reordenar el alta de pedidos del panel para que el flujo operativo quede más natural:

1. cliente remitente;
2. destinatario + teléfono;
3. ciudad;
4. captura de dirección;
5. sugerencias geográficas + mapa;
6. zona autodeducida;
7. bloque de cobros.

## Cambios aplicados

### 1. Nuevo orden visual del formulario

El modal `Nuevo pedido` quedó separado en bloques:

- `Remitente y destinatario`
- `Ubicación de entrega`
- `Valores del pedido`

Con esto el operador ya no salta entre zona, ciudad y cobros antes de terminar de ubicar la entrega.

### 2. Ciudad primero, zona después

La ciudad ahora se selecciona primero desde un `select` con ciudades operativas conocidas.

Después de resolver la dirección:

- la zona se intenta autocompletar;
- se deja visible al final para corrección manual;
- y ya no compite visualmente con la captura principal.

### 3. Preview geográfico asistido

Se añadió un endpoint nuevo:

- `POST /api/shipments/address-preview`

Este endpoint:

- normaliza la dirección igual que `store/update`;
- recompone direcciones guiadas;
- intenta resolver ciudad y zona;
- busca coincidencias geográficas;
- devuelve candidatos con coordenadas;
- y expone una respuesta reutilizable para UI.

### 4. Coincidencias sugeridas de dirección

El formulario ahora consulta candidatos de geocodificación y muestra una lista seleccionable.

Cada coincidencia:

- muestra dirección;
- muestra coordenadas;
- indica proveedor (`Google`, `OpenStreetMap`, `Aproximada`);
- y al tocarla fija `recipient_lat` + `recipient_lng` para el guardado.

### 5. Mapa previo antes de guardar

Debajo de la dirección final ahora aparece una vista previa en mapa:

- usa el punto seleccionado o resuelto;
- permite abrir OpenStreetMap aparte;
- y da confirmación visual de que el pedido quedó bien ubicado antes de crear la guía.

### 6. Persistencia más robusta para el alta

Cuando el operador guarda el pedido, el frontend ya envía:

- `recipient_lat`
- `recipient_lng`

si la dirección fue resuelta en el preview. Esto reduce reprocesos posteriores y mejora el ruteo desde el origen.

## Calidad y auditoría

Validaciones ejecutadas:

- `php artisan test --filter=ShipmentTest`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

Cobertura nueva:

- test del endpoint `address-preview`;
- verificación de zona inferida;
- verificación de coordenadas candidatas en respuesta.

## QA sugerido

1. Crear pedido en Bogotá con dirección guiada.
2. Verificar que aparezcan coincidencias debajo de `Dirección final`.
3. Seleccionar una coincidencia y confirmar que aparece el mapa.
4. Revisar que `Zona de entrega` quede autocompletada.
5. Guardar el pedido y confirmar en detalle que persiste:
   - dirección final;
   - ciudad;
   - zona;
   - coordenadas.

## Limitación conocida

Esta iteración ya resuelve preview + selección + mapa de punto.  
Todavía no es un autocomplete vial completo estilo navegación paso a paso; eso pertenece al siguiente bloque de trabajo del mapa/ruta híbrida.
