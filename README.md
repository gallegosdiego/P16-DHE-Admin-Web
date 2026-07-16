# P16-DHE-Admin-Web

Plataforma administrativa y API central de Danhei Express para operación, finanzas, trazabilidad, reportes y gobierno.

**Estado vigente:** consultar [docs/ESTADO-ACTUAL.md](./docs/ESTADO-ACTUAL.md)
**Pendientes vigentes:** consultar [docs/ROADMAP-ACTIVO.md](./docs/ROADMAP-ACTIVO.md)

## Stack actual

| Capa | Tecnología |
|---|---|
| Backend | Laravel 13 + PHP 8.3 |
| Frontend | Next.js 16 + React 19 + TypeScript + Tailwind v4 |
| Auth | Laravel Sanctum |
| Acceso | middleware de permisos |
| E2E | Playwright |

## Estructura del repositorio

```text
P16-DHE-Admin-Web/
├── api/                      Laravel backend
├── frontend/                 Next.js admin app
│   ├── src/app/(admin)/      rutas protegidas
│   ├── src/components/       UI compartida
│   └── src/lib/              API, auth, tipos y helpers
├── docs/                     estado, roadmap, contratos, QA y operación
└── .github/workflows/        CI
```

## Módulos principales del panel

- `/`
- `/pedidos`
- `/recogidas`, `/recogidas/nueva`, `/recogidas/tareas`, `/recogidas/recepcion`
- `/operacion`
- `/clientes`
- `/conductores`
- `/rutas`
- `/zonas`
- `/novedades`
- `/pagos`
- `/reportes`
- `/usuarios`
- `/auditoria`
- `/metricas`
- `/configuracion`

## Estado funcional resumido

- ingreso unificado de paquetes implementado en API y panel P16;
- portal cliente P14 migrado al mismo contrato de ingreso;
- libros separados para:
  - COD que el piloto debe remitir;
  - servicios que Danhei debe pagar al piloto;
  - COD disponible para transferir al cliente;
- invariantes de asignación cerrados en backend:
  - sin líneas duplicadas;
  - sin remanentes silenciosos;
  - con idempotencia por llave de operación;
- primera interfaz operativa de conciliación en `/pagos`:
  - remesas COD del piloto por selección o FIFO;
  - pagos parciales de servicios al piloto;
  - transferencias parciales del COD disponible al cliente;
  - historial por movimiento con comprobante imprimible/PDF y CSV;
  - saldo anterior, efecto y saldo posterior persistidos en cada comprobante;
  - reversos auditables que restauran las asignaciones sin borrar el movimiento original;
  - asientos de apertura o “día cero” sin crear guías ficticias;
- reglas de remuneración en `/configuracion`:
  - entrega, recogida, devolución a sede y devolución al cliente;
  - alcance global, por piloto, cliente o zona;
  - vigencias y versiones inmutables con motivo, aprobador y auditoría;
  - snapshot de la tarifa aplicada en cada causación para no recalcular historia;
- WhatsApp y Nequi productivo siguen aislados de la ruta crítica.

## Setup local

### Backend

```bash
cd api
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:3000`
Backend: `http://127.0.0.1:8000`

## Comandos de calidad

En `frontend/`:

```bash
npm run lint
npm run typecheck
npm run build
```

En `api/`:

```bash
php artisan test
```

## Documentación canónica

El índice oficial es [docs/README.md](./docs/README.md).

- Estado actual: [docs/ESTADO-ACTUAL.md](./docs/ESTADO-ACTUAL.md)
- Roadmap activo: [docs/ROADMAP-ACTIVO.md](./docs/ROADMAP-ACTIVO.md)
- Arquitectura: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- Contratos API: [docs/API-CONTRACTS.md](./docs/API-CONTRACTS.md)
- Plan financiero: [docs/modulo-financiero-plan.md](./docs/modulo-financiero-plan.md)
- Operación y despliegue: [docs/operations/PLAYBOOK-OPERATIVO.md](./docs/operations/PLAYBOOK-OPERATIVO.md) y [docs/DEPLOY-CPANEL.md](./docs/DEPLOY-CPANEL.md)
- Changelog vigente: [docs/CHANGELOG-ACTUAL.md](./docs/CHANGELOG-ACTUAL.md)

Los sprints viejos, listas históricas y documentos legacy se conservan solo como evidencia.
