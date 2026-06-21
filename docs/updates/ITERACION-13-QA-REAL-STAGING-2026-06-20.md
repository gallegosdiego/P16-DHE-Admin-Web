# Iteración 13 — QA real/staging no destructivo

Fecha: 2026-06-20  
Rama: `dev`  
Repos involucrados:

- `P16-DHE-Admin-Web`
- `P15-DHE-App-Repartidor`

## Objetivo

Preparar y ejecutar la primera capa de QA real/staging sobre los bugs reportados, sin mutar datos productivos ni tocar `main`.

## Ejecutado

### 1. Auditoría de URLs y documentación existente

Se revisaron referencias de infraestructura, playbooks y documentación móvil:

- API: `https://api.danheiexpress.com/api`
- Admin: `https://admin.danheiexpress.com`
- Portal: `https://portal.danheiexpress.com`
- Landing: `https://www.danheiexpress.com`
- App piloto preview: `EXPO_PUBLIC_API_BASE_URL=https://api.danheiexpress.com`

### 2. Smoke público no destructivo

Se agregó y ejecutó:

```powershell
.\scripts\qa-public-smoke.ps1
```

Resultado:

| Target | Resultado |
|---|---|
| `https://api.danheiexpress.com/api/health` | `200 OK` |
| `https://api.danheiexpress.com/api/deploy-check` | `200 OK` |
| `https://admin.danheiexpress.com` | `200 OK` |
| `https://portal.danheiexpress.com` | `200 OK` |
| `https://www.danheiexpress.com` | `200 OK` |

### 3. Checklist maestro de bugs

Se creó:

- `docs/qa/QA-REAL-STAGING-BUGS-2026-06-20.md`

Cubre:

- Safe area inferior en app piloto.
- Estados en español latino.
- Responsive móvil del admin.
- Logout/login de Juan/piloto QA.
- Nuevos pedidos asignados desde admin.
- Creación de pedido con foto.
- Creación de pedido MercadoLibre.
- Labels persistentes en formularios.
- Dashboard y métricas del día.
- Soft-delete de pedidos.

### 4. Checklist móvil específico

Se creó en el repo móvil:

- `P15-DHE-App-Repartidor/docs/QA-PILOTO-UAT-2026-06-20.md`

Cubre:

- Login/logout.
- Pedidos asignados.
- Ruta y paradas.
- Evidencia de entrega.
- Recaudo/COD/MercadoLibre.
- Evidencia requerida por dispositivo.

## No ejecutado por seguridad

No se ejecutaron pruebas autenticadas/mutantes contra producción:

- Crear pedidos.
- Subir fotos.
- Asignar pedidos a Juan.
- Iniciar o modificar rutas.
- Cerrar sesión en usuarios reales.

Motivo:

- Esas pruebas pueden alterar la operación viva y deben hacerse con usuario/piloto QA o en una ventana UAT autorizada.

## Hallazgos

### Confirmado

- API pública responde.
- Deploy-check de API no reporta rutas críticas faltantes.
- Admin, portal y landing cargan.
- App piloto preview apunta a API productiva.
- Ya existe documentación móvil suficiente para orientar el flujo piloto/API.

### Pendiente

- UAT con celular real.
- Confirmar visualmente safe area inferior después del fix.
- Confirmar que Juan o piloto QA conserva pedidos tras logout/login.
- Confirmar que pedidos nuevos asignados desde admin aparecen en app abierta.
- Confirmar upload real de foto de paquete.
- Confirmar creación real de pedido MercadoLibre.

## Auditoría propia

### Omisión detectada

Antes de esta iteración había CI y fixes, pero no un checklist UAT específico para los bugs reportados por capturas/audio.

### Mejora incorporada

Ahora el equipo puede repetir:

- Smoke público rápido con script.
- QA funcional real con checklist.
- Captura de evidencia por bug.

### Riesgo residual

El proyecto sigue necesitando una sesión UAT real con:

- Celular Android físico.
- APK instalada.
- Usuario piloto QA.
- Usuario admin autorizado.
- Datos QA controlados.

## Estado

Iteración 13 deja smoke público y checklists listos para ejecutar UAT autenticado controlado.
