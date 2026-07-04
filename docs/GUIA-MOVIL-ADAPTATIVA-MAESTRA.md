# Guía maestra de versión móvil adaptativa

Fecha base: 2026-07-03  
Estado: Activa  
Ámbito: `P16-DHE-Admin-Web` y cualquier módulo web operativo que deba funcionar bien en celular

## 1. Propósito

Este documento define el estándar único para diseñar, revisar y corregir la experiencia móvil adaptativa del panel administrativo.

La regla principal es:

> **En móvil no se “encoge” la versión desktop. En móvil se reorganiza la experiencia para operar mejor.**

Esta guía debe revisarse antes de tocar:

- `dashboard`
- `pedidos`
- `rutas`
- `pilotos`
- `clientes`
- `reportes`
- cualquier detalle, modal, card, tabla o mapa visible desde celular

---

## 2. Objetivo operativo

La versión móvil del panel debe permitir que una persona pueda:

1. entender el estado operativo rápido;
2. tocar acciones principales sin precisión extrema;
3. leer datos sin zoom manual;
4. seguir rutas, pedidos y pilotos sin fatiga visual;
5. trabajar desde el teléfono aun cuando el panel haya sido pensado primero para escritorio.

---

## 3. Principios obligatorios

### 3.1 Jerarquía primero

En móvil solo se debe ver primero lo más importante:

- estado;
- nombre o código;
- piloto / cliente;
- siguiente acción;
- métricas clave.

Todo lo secundario debe:

- colapsarse,
- moverse debajo,
- o mostrarse bajo demanda.

### 3.2 Una columna dominante

En móvil la interfaz debe vivir principalmente en **una sola columna**.

No se deben conservar en celular:

- layouts de 2 o 3 columnas estilo desktop;
- paneles laterales simultáneos;
- tablas anchas comprimidas.

### 3.3 Acciones grandes y cercanas

Los botones principales deben ser:

- visibles,
- fáciles de tocar,
- y semánticamente claros.

Ejemplos:

- `Ver detalle`
- `Asignar`
- `Reenrutar`
- `Finalizar`
- `Sincronizar`

### 3.4 Menos densidad, más claridad

Si un bloque se ve “completo” pero ilegible en móvil, está mal.

Es mejor:

- menos elementos visibles,
- mejor agrupados,
- con más aire,
- y más legibles.

### 3.5 Estado visible sin abrir nada

Una tarjeta móvil debe mostrar al menos:

- identificador principal;
- estado;
- actor responsable;
- valor o métrica operativa clave;
- acción principal.

---

## 4. Breakpoints y comportamiento base

## 4.1 Breakpoints de referencia

- `xs`: `0` a `479px`
- `sm`: `480px` a `767px`
- `md`: `768px` a `1023px`
- `lg`: `1024px+`

## 4.2 Regla de diseño por breakpoint

### `xs` y `sm`

- diseño totalmente móvil;
- una sola columna;
- tarjetas apiladas;
- tablas convertidas a cards;
- acciones principales al alcance;
- modales en pantalla casi completa;
- mapas con resumen fuera del overlay crítico.

### `md`

- diseño híbrido tablet;
- se pueden usar dos columnas solo si no reduce legibilidad;
- filtros y resúmenes pueden ocupar una fila propia.

### `lg`

- experiencia escritorio completa.

---

## 5. Sistema visual móvil

## 5.1 Tipografía mínima

Nunca usar tamaños donde el usuario deba acercar o hacer zoom para operar.

Referencia:

- título principal: `28–32px`
- subtítulo de pantalla: `14–16px`
- título de card: `18–22px`
- texto principal: `14–16px`
- texto secundario: `12–14px`
- meta o badge: `11–13px`

## 5.2 Espaciado

Usar espaciado consistente.

Escala recomendada:

- `4`
- `8`
- `12`
- `16`
- `20`
- `24`
- `32`

Reglas:

- separación entre secciones: mínimo `16`
- padding de card: `16`
- gap entre acciones: `8` o `12`
- no apilar bloques sin respiración visual

## 5.3 Bordes y radios

Mantener identidad visual consistente:

- cards principales: radio `16–24`
- inputs: radio `12–16`
- botones primarios: radio `14–18`
- badges: radio tipo cápsula

## 5.4 Contraste

El estado siempre debe distinguirse rápido:

- pendiente
- entregado
- novedad
- cancelado
- en ruta
- completado

Nunca confiar solo en color. Debe existir:

- texto,
- badge,
- o icono de apoyo.

---

## 6. Patrones UI obligatorios por componente

## 6.1 Dashboard móvil

### Debe tener

- resumen corto arriba;
- KPIs principales en cards grandes;
- módulos secundarios debajo;
- máximo 2 KPIs por fila en móvil;
- gráficas simples o barras compactas.

### No debe tener

- demasiados widgets simultáneos;
- tablas comprimidas;
- textos de explicación largos antes de la métrica.

## 6.2 Listados de pedidos / rutas / pilotos

### Deben convertirse a cards

Cada card debe mostrar:

- nombre o código;
- estado;
- dato secundario útil;
- persona relacionada;
- acción principal.

### Acciones

En móvil:

- máximo 2 acciones visibles principales por card;
- acciones secundarias en menú o sección expandible.

## 6.3 Tablas

En móvil, una tabla ancha debe transformarse en:

- card resumen;
- filas clave;
- bloques expandibles;
- o vista detalle por elemento.

Regla:

> Si una tabla obliga a scroll horizontal para operar, no está adaptada.

## 6.4 Formularios

Cada input debe tener:

- label visible arriba;
- placeholder opcional, nunca como única referencia;
- mensaje de error claro;
- separación suficiente.

En móvil:

- un campo por fila, salvo campos muy cortos;
- botones de guardar visibles;
- acciones destructivas separadas de guardar.

## 6.5 Módulo de rutas

En móvil el flujo de rutas debe presentarse en este orden:

1. estado de la ruta;
2. resumen corto;
3. mapa;
4. siguiente parada;
5. lista de paradas;
6. acciones operativas.

Nunca:

- meter resumen grande encima del mapa tapando la ruta;
- conservar estructura de tres columnas de escritorio;
- esconder la parada actual dentro de demasiados bloques.

### Patron operativo para rutas admin en celular

Cuando exista monitoreo de varias rutas activas:

1. el selector de pilotos/rutas activas debe aparecer antes del detalle;
2. ese selector debe ser tocable con scroll horizontal o cards apiladas;
3. cada tarjeta debe resumir piloto, zona, frescura de tracking y parada actual;
4. el detalle profundo debe mostrarse debajo, no en paralelo comprimido;
5. las acciones primarias deben ser grandes y visibles (Abrir monitor, Ver detalles, Iniciar ruta).

Objetivo: permitir cambiar de piloto en segundos sin romper la lectura del monitoreo ni heredar la grilla desktop comprimida.

## 6.6 Mapas

Reglas obligatorias:

- el mapa debe tener área visible útil;
- overlays mínimos;
- leyenda corta;
- botón de centrar claro;
- resumen fuera del área principal cuando tape demasiada ruta.

Orden recomendado:

1. título
2. progreso corto
3. mapa visible
4. resumen de ruta
5. lista de paradas

## 6.7 Modales y paneles

En móvil preferir:

- drawer inferior,
- pantalla completa,
- o modal alto con scroll.

No usar:

- modal pequeño centrado con mucho contenido;
- varias columnas dentro del modal.

---

## 7. Reglas operativas de responsive

## 7.1 Lo más importante arriba

Cada pantalla móvil debe responder en menos de 3 segundos visuales:

- ¿qué estoy viendo?
- ¿qué estado tiene?
- ¿qué hago ahora?

## 7.2 Acción principal única por bloque

Cada card o módulo debe tener una acción dominante.

Ejemplo:

- pedido → `Ver detalle`
- ruta → `Abrir seguimiento`
- piloto → `Ver historial`

## 7.3 Información secundaria colapsable

Mover a acordeón o detalle:

- metadata extensa;
- timestamps largos;
- notas internas;
- trazas técnicas;
- campos poco usados.

## 7.4 Sticky actions con cuidado

Se puede usar CTA fijo abajo cuando:

- la acción sea crítica;
- no tape contenido;
- no choque con navegación del navegador o sistema.

## 7.5 Errores y vacíos

Todo estado vacío o error debe tener:

- título claro;
- explicación corta;
- siguiente acción;
- opción de retry si aplica.

---

## 8. Responsive específico para el panel administrativo

## 8.1 Header móvil

Debe contener solo:

- menú;
- nombre corto del módulo;
- 1 o 2 acciones globales importantes.

No debe contener en móvil:

- demasiados iconos simultáneos;
- textos largos de usuario;
- controles secundarios sin prioridad.

## 8.2 Sidebar

En móvil siempre debe ir:

- colapsado,
- en drawer,
- o en navegación de menú.

Nunca fijo consumiendo ancho.

## 8.3 Filtros

Los filtros deben:

- apilarse;
- abrirse en bloque colapsable;
- o vivir en sheet/modal si son muchos.

## 8.4 Cards operativas

Cada card móvil del admin debe incluir:

- título;
- estado;
- actor principal;
- valor clave;
- CTA.

Ideal:

- badge arriba derecha;
- nombre/código arriba izquierda;
- acciones abajo.

---

## 9. Criterios de calidad antes de dar una pantalla por terminada

Una pantalla móvil adaptada solo se considera lista si cumple:

- se entiende sin zoom;
- se puede tocar con una mano razonablemente;
- no conserva layout desktop comprimido;
- no hay scroll horizontal;
- estados y acciones se identifican rápido;
- la información prioritaria aparece primero;
- el mapa, si existe, conserva área útil real;
- el contenido no se monta sobre botones del sistema o safe area;
- no hay overlays que escondan la acción principal.

---

## 10. Checklist obligatorio de QA móvil

Antes de cerrar una mejora responsive validar:

- Android angosto
- Android medio
- navegador móvil
- modo claro
- modo oscuro si aplica
- teclado abierto
- módulo con datos vacíos
- módulo con datos reales
- módulo con datos extensos

### Checklist

- [ ] no hay texto ilegible
- [ ] no hay botones demasiado pequeños
- [ ] no hay cards saturadas
- [ ] no hay columnas desktop comprimidas
- [ ] no hay scroll horizontal accidental
- [ ] los badges de estado son claros
- [ ] la acción principal es visible
- [ ] el mapa no queda tapado
- [ ] los formularios tienen labels reales
- [ ] el footer o bottom bar no tapa contenido

---

## 11. Orden recomendado para adaptar módulos

### Prioridad alta

1. `rutas`
2. `pedidos`
3. `dashboard`
4. `pilotos`

### Prioridad media

5. `clientes`
6. `reportes`
7. `auditoria`
8. `configuracion`

---

## 12. Definición de terminado

Un módulo no está “responsive” porque se vea completo en pantalla pequeña.

Un módulo solo está terminado cuando:

1. se opera bien en celular;
2. mantiene la identidad visual Danhei;
3. prioriza claridad sobre densidad;
4. soporta estados reales del negocio;
5. no obliga al usuario a luchar con la interfaz.

---

## 13. Cómo alimentar esta guía en el futuro

Cada vez que detectemos una mejora o problema nuevo, agregar:

### A. Contexto

- módulo
- pantalla
- problema detectado

### B. Decisión

- qué patrón se adopta
- qué patrón se evita

### C. Evidencia

- captura
- QA
- validación real

### D. Regla reusable

- cómo convertir esa solución en estándar para otras pantallas

---

## 14. Próximas mejoras sugeridas para esta guía

- patrón visual oficial para cards de rutas en móvil;
- patrón oficial para tablas transformadas a cards;
- patrón para filtros en bottom sheet;
- patrón para mapas con lista de paradas;
- patrón para seguimiento vivo del piloto;
- patrón para historial operativo y documentos del piloto;
- librería interna de componentes responsive compartidos.

---

## 15. Regla final

Si una pantalla móvil genera esta sensación:

- “se ve todo, pero no se entiende”,
- “cabe, pero no se puede usar bien”,
- “parece desktop encogido”,

entonces **no cumple esta guía** y debe reorganizarse antes de darse por buena.
