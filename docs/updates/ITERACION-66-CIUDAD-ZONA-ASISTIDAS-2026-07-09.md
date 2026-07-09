# Iteracion 66 - Ciudad y zona asistidas en pedidos

Fecha: 2026-07-09
Repositorio: `P16-DHE-Admin-Web`

## Objetivo

Pulir el formulario de creación de pedidos para que:

- la ciudad sea más fácil de seleccionar;
- la zona no moleste como requisito manual cuando debe autocompletarse;
- y la relación `ciudad -> zonas` quede más coherente.

## Cambios aplicados

### 1. Ciudad con sugerencias operativas

`Ciudad de entrega` ahora usa sugerencias basadas en las ciudades reales presentes en las zonas activas del sistema.

Impacto:

- Bogotá sigue entrando por defecto;
- si más adelante hay otras ciudades activas, el usuario las puede escoger sin improvisar texto libre.

### 2. Zona deja de bloquear el formulario

`Zona de entrega` ya no queda marcada como requisito manual del navegador.

Ahora el comportamiento es:

- primero se intenta autocompletar desde la dirección;
- si la operación necesita ajuste manual, el usuario todavía puede escoger una zona existente;
- pero ya no aparece el bloqueo prematuro de `Completa este campo` mientras la dirección aún se está armando.

### 3. Zonas filtradas por ciudad

Cuando el usuario cambia la ciudad:

- la lista sugerida de zonas se filtra a esa ciudad;
- si la zona actual no pertenece a esa ciudad, se limpia;
- si la dirección permite inferir una zona dentro de esa ciudad, se reaplica automáticamente.

## Validación ejecutada

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Resultado esperado en QA

- Bogotá aparece bien como ciudad sugerida;
- la zona ya no bloquea el guardado antes de tiempo;
- la ciudad y la zona quedan mucho más coordinadas con la dirección capturada.
