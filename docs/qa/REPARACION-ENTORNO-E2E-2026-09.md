# OT-08 — Reparación del entorno E2E (2026-09-07)

## Diagnóstico

El fallo original no estaba en `/pedidos`, el proxy ni los selectores. El
frontend local resolvía `NEXT_PUBLIC_API_URL` desde `.env` como
`http://localhost:8000/api`, mientras que `e2e/support/mock-api.ts` solo
registraba una ruta para `http://127.0.0.1:8000/api/**`. Por tanto, la
petición real a `/api/me` no recibía el mock; la sesión se invalidaba y la
prueba terminaba en la pantalla de login. La evidencia de Playwright fue el
snapshot del error: `main` contenía `Acceso al panel administrativo` y no
`Paquetes`. La prueba manual equivalente registró `API
http://localhost:8000/api/me` sin alcanzar la ruta mock.

## Arreglo aplicado

En `frontend/e2e/support/mock-api.ts` el interceptor ahora usa
`**/api/**`, conservando el enrutamiento por `pathname`. Así el mock es
independiente de si el entorno usa `localhost` o `127.0.0.1`, y sigue sin
hacer peticiones reales al backend.

También se corrigieron las capturas de `pedidos-certification.spec.ts` para
usar `testInfo.outputPath(...)` en lugar de una ruta absoluta de otro equipo.
No hubo cambios en `src/` ni en el comportamiento de la aplicación.

## Evidencia de verificación

- `pedidos-certification.spec.ts`, `smoke.spec.ts` y
  `pedidos-stepper.spec.ts`: **8/8 en verde** tras el arreglo del mock.
- En esa ejecución: dashboard autenticado, listado de pedidos, stepper y
  paleta de comandos renderizaron correctamente.
- La ejecución completa inició con **72 pruebas**, pero quedó bloqueada por
  un problema independiente fuera del alcance autorizado: Next no puede
  compilar `src/components/print-receipt.tsx` ni
  `src/components/print-reception-receipt.tsx` porque falta el módulo
  `qrcode` (`Module not found: Can't resolve 'qrcode'`).
- Ese bloqueo afecta varias pruebas antiguas de rutas, finanzas y lote 5;
  no es una regresión introducida por este cambio. Resolverlo requiere
  tocar dependencias/código de aplicación y queda pendiente de autorización.

## Prevención

El mock E2E no debe acoplarse al hostname concreto del backend local. Si se
cambia `NEXT_PUBLIC_API_URL`, debe verificarse que el interceptor cubra la
ruta API efectiva y que la prueba autenticada no termine en `/login`.

