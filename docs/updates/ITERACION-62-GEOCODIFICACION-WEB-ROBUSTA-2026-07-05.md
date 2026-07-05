# Iteracion 62 - geocodificacion web robusta y entrada guiada

## Objetivo

Resolver el caso donde en el panel/admin algunos pedidos nuevos quedaban con geodata pendiente o dificil de reparar por entradas inconsistentes en:

- direccion;
- zona;
- ciudad.

La meta fue endurecer el flujo completo de P16 para que:

1. el pedido nazca mas limpio desde el formulario;
2. el backend normalice ubicacion antes de geocodificar;
3. el geocoder pruebe variantes mas utiles antes de rendirse.

## Hallazgo raiz

El problema no estaba solo en el proveedor de geocodificacion.

La falla venia de la combinacion de estos factores:

1. **Entrada demasiado libre en el formulario**
   - zona y ciudad eran texto libre sin guia operativa;
   - muchos casos terminaban con direccion duplicando zona/ciudad.

2. **Normalizacion insuficiente en backend**
   - el sistema intentaba geocodificar casi exactamente lo que escribia el usuario;
   - diferencias como `Bogotá` vs `Bogota`, `chapinero` vs `Chapinero`, o `Cl` vs `Calle` reducian consistencia;
   - detalles secundarios tipo apartamento/oficina ensuciaban la consulta.

3. **Pocas variantes de consulta**
   - antes solo se intentaba:
     - direccion + zona + ciudad;
     - direccion + ciudad.
   - si la direccion incluia ruido o duplicaba contexto, podia fallar aun teniendo informacion suficiente.

## Cambios implementados

### Backend

#### `api/app/Domain/Shipment/Services/GeocodingService.php`

- se agrego `normalizeLocationInput()` como punto central para:
  - normalizar `recipient_address`;
  - normalizar `recipient_city`;
  - normalizar `recipient_zone`.
- ahora la direccion:
  - elimina acentos en la capa tecnica;
  - limpia espacios y separadores raros;
  - estandariza abreviaturas comunes:
    - `cl`, `cll` -> `Calle`;
    - `cra`, `kr`, `kra` -> `Carrera`;
    - `diag` -> `Diagonal`;
    - `tv`, `transv` -> `Transversal`;
    - `no`, `nro`, `numero` -> `#`.
- si la direccion trae al final la misma zona o ciudad, se limpian para evitar consultas redundantes.
- si la direccion trae detalle secundario (`apartamento`, `oficina`, `torre`, etc.), el geocoder ahora intenta tambien una variante simplificada.
- las consultas probadas ahora incluyen:
  - direccion normalizada + zona + ciudad;
  - direccion normalizada + zona;
  - direccion normalizada + ciudad;
  - variante simplificada de direccion con esos mismos contextos.

#### `api/app/Domain/Shipment/Services/ShipmentGeodataService.php`

- ahora normaliza `recipient_address`, `recipient_zone` y `recipient_city` dentro de `repair()`;
- eso aplica tanto para:
  - pedidos nuevos;
  - ediciones;
  - reparacion historica con `repair-geodata`;
  - comando `shipments:geocode-missing`.

### Frontend admin

#### `frontend/src/app/(admin)/pedidos/page.tsx`

- el formulario de crear pedido ahora carga zonas activas;
- el campo de zona usa sugerencias (`datalist`) para bajar errores operativos;
- al elegir una zona conocida, la ciudad se autocompleta desde esa zona;
- se agregaron hints operativos:
  - usar una zona existente;
  - no repetir zona ni ciudad dentro de la direccion;
  - ajustar ciudad solo si de verdad cambia.
- antes de enviar, el frontend hace `trim()` de los campos clave de ubicacion y contacto.

## Pruebas ejecutadas

- `php -l api/app/Domain/Shipment/Services/GeocodingService.php`
- `php -l api/app/Domain/Shipment/Services/ShipmentGeodataService.php`
- `php artisan test --filter=GeocodingServiceTest --do-not-cache-result`
- `php artisan test --filter=ShipmentTest --do-not-cache-result`
- `php artisan test --filter=GeocodeMissingShipmentsCommandTest --do-not-cache-result`
- `npm run lint` en `frontend`
- `npm run typecheck` en `frontend`

## Impacto esperado

- menos pedidos nuevos con geodata pendiente evitable;
- menos casos donde la direccion "si existe" pero no se convierte bien a coordenadas;
- mejor recuperacion de pedidos historicos desde `repair-geodata`;
- menos dependencia operativa de correcciones manuales para zona/ciudad mal digitadas.

## QA recomendado en produccion

1. crear pedidos con direccion limpia y zona valida;
2. crear pedidos con:
   - `Bogotá` acentuado;
   - zona en minuscula;
   - abreviaturas tipo `cl`, `cra`, `diag`;
3. crear un pedido con detalle secundario:
   - `Calle 22 #14-05 apartamento 201`;
4. confirmar en panel que:
   - nazca con `recipient_lat` y `recipient_lng`, o
   - quede reparable y visible en `geo-summary` si el proveedor externo no resuelve;
5. ejecutar `repair-geodata` sobre un caso legado para confirmar recuperacion.

## Lo que aun depende del entorno

Si un pedido sigue sin coordenadas despues de esta mejora, normalmente ya no sera por formato basico sino por uno de estos factores externos:

- direccion realmente ambigua;
- zona inexistente o mal parametrizada;
- proveedor de geocodificacion sin match para ese punto;
- datos urbanos incompletos en la operacion real.

En esos casos la siguiente capa de mejora ya no es solo software: toca fortalecer catalogo de zonas y politica operativa de captura de direcciones.
