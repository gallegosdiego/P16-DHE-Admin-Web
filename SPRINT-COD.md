# Sprint Cod — Features de Producción

## Contexto
App funcional, 37 endpoints, 8 módulos con API real. Ahora necesitamos features que impresionen en la demo del viernes con Ángel.

**Repo:** github.com/gallegosdiego/P16-DHE-Admin-Web
**Backend:** localhost:8000 | **Frontend:** localhost:3000
**Credenciales:** admin@danheiexpress.com / DanheiAdmin2026!

Al final de CADA bloque: `npm run lint` debe dar 0 errores.

---

## BLOQUE 1: Búsqueda global (Ctrl+K)

Crear `src/components/command-palette.tsx`:
- Modal overlay que se abre con Ctrl+K o click en ícono lupa del navbar
- Input con debounce 300ms que busca en paralelo:
  - `GET /api/shipments?search={q}&per_page=5` → guía + destinatario + chip estado
  - `GET /api/clients?search={q}&per_page=5` → nombre + tipo pago
  - `GET /api/drivers?search={q}&per_page=5` → nombre + zona + badge
- Sección "Acciones rápidas" (lista estática): Nuevo pedido, Nuevo cliente, Ver novedades, Conciliar pagos, Exportar reporte
- Click en resultado navega a la ruta correspondiente
- Esc cierra. Fade-in al abrir.
- Integrar en `layout.tsx`: lupa + hint "Ctrl+K" al lado de la campana

## BLOQUE 2: Dashboard en vivo

En `src/app/(admin)/page.tsx`:
- Auto-refresh cada 30s con indicador "Actualizado hace Xs" + dot verde pulsante
- Si falla conexión: dot rojo "Sin conexión"
- Botón refresh manual
- Reemplazar gráfica mock "Entregas por hora" con barra horizontal segmentada real (stacked bar proporcional por estado, colores del enum, animada)
- Agregar tabla "Últimos 5 envíos" debajo de Eventos: guía, destinatario, estado, conductor, tiempo relativo ("hace 5 min"). Click → /pedidos
- Widget financiero expandible: "Por cobrar $X" + "N clientes con deuda" + click expande top 3 deudores

## BLOQUE 3: Selección múltiple en Pedidos

En `src/app/(admin)/pedidos/page.tsx`:
- Checkbox por fila + "Seleccionar todos" en header
- Contador "X seleccionados" visible
- Barra sticky inferior cuando hay selección con acciones:
  - "Asignar conductor" → selector + POST assign para cada seleccionado
  - "Cambiar estado" → selector de estado válido + POST status para cada uno
- Loading con progreso: "Procesando 3/5..."
- Toast al completar: "5 envíos actualizados"
- Deseleccionar todo al completar

## BLOQUE 4: Historial de cliente

En `src/app/(admin)/clientes/page.tsx` (modal detalle):
- Al abrir detalle de un cliente, agregar tabs:
  - Tab "Resumen" (lo que ya existe: datos + financiero)
  - Tab "Envíos" → tabla con todos sus envíos (GET /api/shipments?client_id={id})
    - Columnas: guía, destinatario, estado, fecha, monto
    - Paginación si hay más de 10
  - Tab "Direcciones" → lista de direcciones guardadas del cliente
    - Si el endpoint lo soporta, mostrar zona + label
- Badge en cada tab con conteo: "Envíos (12)" "Direcciones (3)"

## BLOQUE 5: Estadísticas en Conductores

En `src/app/(admin)/conductores/[id]/page.tsx`:
- Agregar sección "Rendimiento" debajo del resumen del día:
  - Card "Tasa de entrega": entregados / asignados × 100 (con barra de progreso circular o lineal)
  - Card "Recaudo": dinero cobrado vs pendiente (barra segmentada verde/gris)
  - Card "Novedades": conteo de envíos con issue (rojo si > 0)
- Agregar tabla de envíos mejorada con filtro por estado (tabs: Todos | Entregados | Pendientes | Novedad)
- Botón "Asignar envío" que abre selector de envíos sin conductor asignado

## BLOQUE 6: Impresión de guía / recibo

Crear `src/components/print-receipt.tsx`:
- Componente que genera una guía imprimible para un envío
- Contenido del recibo (formato 80mm térmico):
  ```
  ═══════════════════════════
  DANHEI EXPRESS
  NIT: XXX.XXX.XXX-X
  ═══════════════════════════
  GUÍA: #DHE00042
  FECHA: 13/05/2026 10:30 AM
  ───────────────────────────
  REMITENTE:
  TechStore Colombia
  310 555 1234
  ───────────────────────────
  DESTINATARIO:
  Ana López
  311 222 3333
  Cl 100 #20-30, Usaquén
  ───────────────────────────
  TIPO: Contra entrega
  VALOR COD: $50.000
  FLETE: $11.500
  ───────────────────────────
  [CÓDIGO DE BARRAS / QR]
  DHE2026051300042
  ═══════════════════════════
  ```
- Usar `window.print()` con CSS `@media print` que oculta todo menos el recibo
- QR code: usar una librería ligera o generar con API pública (ej: `api.qrserver.com`)
- Integrar botón "🖨️ Imprimir guía" en el modal de detalle de Pedidos
- Que también funcione desde `/conductores/{id}` (imprimir guía de un envío asignado)

## BLOQUE 7: Módulo de Configuración funcional

En `src/app/(admin)/configuracion/page.tsx` (actualmente readonly):

Hacerlo parcialmente funcional:
- **Perfil:** Formulario editable con nombre, email, teléfono del usuario logueado. Botón "Guardar" que haga PUT /api/me (si el endpoint no existe, mostrar toast "Próximamente" pero el form debe verse real)
- **Cambiar contraseña:** 3 campos (actual, nueva, confirmar). Validación frontend: mínimo 8 chars, coincidencia. Botón "Cambiar" con loading. Si no hay endpoint, toast "Próximamente"
- **Empresa:** Card con datos de Danhei Express hardcodeados bonitos:
  - Logo (usar el de /public si existe, o las iniciales "DE" en magenta)
  - Razón social: DANHEI EXPRESS S.A.S.
  - NIT: (dejar campo editable pero sin endpoint)
  - Dirección, teléfono, email
- **Tarifas:** Tabla editable (visual) de tarifas por zona:
  | Zona | Tarifa base | Adicional/kg |
  | Centro | $8.000 | $1.500 |
  | Norte | $10.000 | $2.000 |
  | Sur | $9.500 | $1.800 |
  - Botón "Guardar tarifas" → toast "Próximamente — las tarifas se configurarán aquí"
- **Sistema de guías:** Mostrar readonly:
  - Formato: DHE + YYYYMMDD + NNNNN
  - Último consecutivo: mostrar el número más alto de la BD (o hardcodear "00007" por los demo)
  - Prefijo: DHE (no editable)

## BLOQUE 8: Dark mode

Implementar toggle de tema oscuro:
- Crear `src/lib/theme.tsx`: ThemeProvider con context (light/dark)
- Guardar preferencia en localStorage key `dhe_theme`
- Respetar `prefers-color-scheme` del sistema como default
- Toggle: ícono sol/luna en el navbar (al lado de la campana)
- Variables CSS en globals.css usando `[data-theme="dark"]`:
  - Fondo: #0f0f23
  - Cards: #1a1a2e
  - Texto: #e0e0e0
  - Sidebar: #16162a
  - Bordes: #2a2a3e
  - Magenta primary: mantener #D1007F (se ve bien en dark)
  - Chips de estado: mantener colores pero con opacidad 20% de fondo
- Verificar que TODOS los módulos se vean bien en dark mode
- Transición suave (transition: background-color 0.3s, color 0.3s)

## BLOQUE 9: Error boundaries + offline awareness

- Crear `src/components/error-boundary.tsx`: componente que captura errores de React y muestra pantalla amigable con botón "Reintentar" en vez de página en blanco
- Crear `src/components/offline-banner.tsx`: banner fijo arriba que aparece cuando `navigator.onLine === false`: "Sin conexión a internet — los datos pueden no estar actualizados"
- En `api.ts`: si un fetch falla por network error, mostrar toast "Error de conexión. Verifica tu internet." en vez de error genérico
- Envolver el layout principal con ErrorBoundary
- Agregar OfflineBanner al layout

## BLOQUE 10: Autoverificación completa

Correr esta checklist al final. Si algo falla, arréglarlo:

```
[ ] npm run lint → 0 errores
[ ] npm run build → compila OK
[ ] Login funciona
[ ] Ctrl+K abre búsqueda, resultados aparecen, navegación funciona
[ ] Dashboard se auto-refresca (esperar 30s y verificar)
[ ] Dashboard barra de estados muestra datos reales
[ ] Pedidos: selección múltiple funciona, acciones batch funcionan
[ ] Pedidos: botón imprimir guía genera recibo legible
[ ] Clientes: detalle tiene tabs con envíos del cliente
[ ] Conductores: detalle tiene stats de rendimiento
[ ] Pagos: gastos y nómina con datos reales
[ ] Configuración: formularios visibles y bonitos
[ ] Dark mode: toggle funciona, todos los módulos se ven bien
[ ] Offline banner aparece al desconectar red
[ ] Error boundary muestra pantalla amigable
[ ] Responsive 375px sigue funcionando en todos los módulos
[ ] Búsqueda global funciona en mobile
```

Reportar solo cuando TODO pase.
