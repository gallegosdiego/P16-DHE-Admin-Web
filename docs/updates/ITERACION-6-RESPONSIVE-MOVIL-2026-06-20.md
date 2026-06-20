# Iteración 6 — Optimización móvil del panel administrativo

Fecha: 2026-06-20  
Repositorio: `P16-DHE-Admin-Web`  
Rama: `dev`

## Problema observado

En celular, el panel administrativo y la vista de pedidos quedaban demasiado pegados a las zonas del sistema/navegador móvil. Esto podía provocar:

- Encabezado operativo compitiendo con la barra superior del teléfono o navegador.
- Menú lateral usando `100vh`, con comportamiento inestable en navegadores móviles.
- Acciones masivas de pedidos demasiado cerca de la barra inferior del sistema.
- Botones de tarjetas móviles pequeños o visualmente apretados para operación diaria.

## Solución aplicada

### Layout global admin

- Se reemplazó la dependencia visual de `min-h-screen`/`100vh` por utilidades con `100dvh`.
- Se agregaron clases globales para:
  - altura real del shell móvil;
  - safe-area superior del header;
  - safe-area superior/inferior del sidebar;
  - navegación lateral con altura dinámica;
  - touch targets mínimos de `44px`;
  - bottom sheet con `env(safe-area-inset-bottom)`.

### Header operativo

- El header sticky ahora respeta `env(safe-area-inset-top)`.
- Los botones principales del header tienen objetivo táctil mínimo:
  - menú;
  - búsqueda;
  - cambio de tema;
  - notificaciones;
  - salir.

### Pedidos móvil

- El checkbox de selección tiene área táctil más cómoda.
- Las acciones por tarjeta se organizan en una grilla de tres columnas.
- Botones `Detalle`, acción de estado y `Eliminar` quedan centrados y con altura mínima uniforme.
- El modal de creación de pedido usa `mobile-modal-safe-area`.
- Los botones de los modales se apilan correctamente en móvil.
- La barra de acciones masivas ahora:
  - respeta safe-area inferior;
  - limita altura con scroll interno;
  - usa grilla móvil para no aplastar selects y botones.

## Archivos modificados

- `frontend/src/app/globals.css`
- `frontend/src/app/(admin)/layout.tsx`
- `frontend/src/app/(admin)/pedidos/page.tsx`

## Validación ejecutada

- `npx eslint -- "src/app/(admin)/layout.tsx" "src/app/(admin)/pedidos/page.tsx"`
- `npx tsc --noEmit --incremental false`
- `git diff --check`

Resultado: validación correcta.

Además se aplicó revisión React de accesibilidad básica y se agregaron `type="button"` a acciones no-submit modificadas.

## Auditoría propia de la iteración

### Omisiones encontradas

- No se hizo verificación visual con navegador local porque no se dejó un servidor de desarrollo activo en esta iteración.
- No se rediseñaron todas las páginas internas del panel; se corrigió el layout base y la pantalla de pedidos, que es la superficie operativa más crítica.

### Mejoras recomendadas siguientes

- Probar visualmente `/`, `/pedidos`, `/rutas` y `/usuarios` en viewport móvil real.
- Crear un set de pruebas visuales Playwright para detectar regresiones de safe-area, bottom sheets y botones mínimos.
- Revisar componentes compartidos de botones para consolidar `admin-touch-target` y evitar repetir clases.
