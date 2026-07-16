# Centro documental de Danhei Express

**Última revisión:** 15 de julio de 2026

**Estado:** activo; portal documental canónico

**Ámbito:** P16 Admin/API y contratos compartidos con P13, P14 y P15

Este directorio es el punto de entrada oficial para entender, operar y continuar el ecosistema Danhei. La documentación histórica se conserva como evidencia, pero no sustituye el estado actual ni el roadmap activo.

## Fuentes de verdad

Leer en este orden:

1. [Estado actual](./ESTADO-ACTUAL.md): qué está implementado, desplegado o pendiente de validación.
2. [Roadmap activo](./ROADMAP-ACTIVO.md): únicos pendientes priorizados y criterios de cierre.
3. [Plan maestro operativo y COD](./PLAN-MAESTRO-IMPLEMENTACION-ECOSISTEMA-OPERATIVO-COD.md): visión funcional y arquitectura objetivo.
4. [Arquitectura](./ARCHITECTURE.md): estructura técnica vigente de P16 y sus consumidores.
5. [Contratos API](./API-CONTRACTS.md): endpoints y estructuras consumidas por frontend, portal y APK.
6. [Gobernanza documental](./GOBERNANZA-DOCUMENTAL.md): reglas para mantener estos documentos coherentes.
7. [Changelog actual](./CHANGELOG-ACTUAL.md): cambios vigentes en formato UTF-8.

## Operación y despliegue

- [Deploy manual del API en cPanel](./DEPLOY-CPANEL.md)
- [Guía general de despliegue](./DEPLOYMENT.md)
- [Playbook operativo](./operations/PLAYBOOK-OPERATIVO.md)
- [Observabilidad](./operations/OBSERVABILITY-RUNBOOK.md)
- [Checklist staging/UAT](./operations/STAGING-UAT-CHECKLIST.md)
- [QA E2E mínimo](./qa/E2E-MINIMAL.md)
- [UAT integral P14/P15/P16](./qa/UAT-ECOSISTEMA-2026-07-15.md)
- [Matriz de permisos](./security/PERMISSION-VERIFICATION-MATRIX.md)

## Dominios funcionales

- [Unificación del ingreso de paquetes](./PLAN-UNIFICACION-INGRESO-PAQUETES-2026-07-15.md)
- [Cierre del sistema financiero](./modulo-financiero-plan.md)
- [Guía visual y móvil](./GUIA-MOVIL-ADAPTATIVA-MAESTRA.md)
- [Arquitectura de rutas y piloto](./ARQUITECTURA-RUTAS-PILOTO-MAESTRA-2026-06-30.md)
- [WhatsApp, integración aislada](./integracion-wasa/README.md)

## Evidencia de implementación

`updates/` es un registro cronológico de iteraciones y cierres. Sirve para auditoría y diagnóstico, no como backlog vigente. Los cierres más recientes son:

- [Fundación operativa](./updates/FASE-2-FUNDACION-DOMINIO-2026-07-11.md)
- [Solicitudes multicanal](./updates/FASE-3-SOLICITUDES-MULTICANAL-2026-07-11.md)
- [Recogida física](./updates/FASE-4-RECOGIDA-FISICA-PILOTO-2026-07-11.md)
- [Aislamiento del CI backend](./updates/CI-BACKEND-AISLADO-POR-ARCHIVO-2026-07-12.md)
- [Alineación visual de operaciones](./updates/ALINEACION-VISUAL-OPERACIONES-2026-07-14.md)

## Archivo histórico

Los siguientes materiales no son instrucciones vigentes:

- `documentacion-legacy/`;
- `CHANGELOG.md` anterior al 12 de julio, conservado por trazabilidad y con codificación heredada;
- archivos `SPRINT-*` de la raíz del repositorio;
- listas de pendientes con fecha anterior al roadmap activo;
- bitácoras, informes de reunión y documentos de investigación ya consolidados.

No se eliminan porque explican decisiones anteriores y pueden ayudar a reconstruir incidentes. Si contradicen [Estado actual](./ESTADO-ACTUAL.md), prevalece Estado actual.

## Repositorios relacionados

| Código | Producto | Documento principal |
|---|---|---|
| P13 | Landing pública | `P13-DHE-Landing-Page-/README.md` |
| P14 | Portal cliente | `P14-DHE-app-Cliente-/README.md` |
| P15 | Aplicación piloto | `P15-DHE-App-Repartidor/README.md` |
| P16 | Admin y API común | `P16-DHE-Admin-Web/README.md` |
