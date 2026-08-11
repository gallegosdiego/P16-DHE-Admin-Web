# Roles del ecosistema Danhei

**Última revisión:** 11 de agosto de 2026

**Cinco roles, ni uno más.** Cada persona del sistema encaja en exactamente uno.

---

## Para qué es cada uno

### `superadmin` — Desarrollo
Quien administra **la aplicación misma**, no el negocio. Es el rol de Diego y de quien desarrolle.

Acceso total, sin excepción. Es además el **único** que puede modificar credenciales de integración (claves de Google Maps, tokens de WhatsApp) desde Configuración. Esa puerta es deliberada: cambiar una credencial no es una tarea de negocio.

No se ofrece en el desplegable de creación de usuarios. Se asigna a mano, a propósito.

### `administrador` — La dueña o dueño del negocio
Quien dirige Danhei. Ve y gestiona toda la operación y todas las finanzas: envíos, rutas, pilotos, clientes, conciliación, nómina, gastos, reportes y usuarios.

### `operador` — Mostrador
El empleado que está en el local recibiendo los paquetes.

Puede registrar el ingreso, crear y editar envíos, asignarlos, cambiar su estado, consultar pilotos y clientes, y ver las rutas. **No accede a finanzas ni a la gestión de usuarios**, que es lo que lo distingue del administrador.

### `driver` — El piloto
En pantalla aparece como **«Conductor / Piloto»**. Es el rol que usa la app móvil P15.

Ve su ruta y sus envíos, cambia el estado de sus entregas y registra el recaudo contra entrega. Nada fuera de lo suyo: el middleware `ScopeClient` lo confina a su propio `driver_id`.

Requiere estar vinculado a un registro de piloto. El panel lo exige al crear el usuario.

### `client` — El cliente corporativo
En pantalla, **«Cliente»**. Es el rol del portal P14, donde el cliente consulta lo suyo y solicita recogidas.

Ve solo sus envíos y sus recogidas; `ScopeClient` lo confina a su `client_id`. Requiere estar vinculado a un cliente.

> **Estado al 11/08/2026:** hay 60 clientes registrados pero **ningún usuario con este rol**. Es lo esperado: todavía no se ha dado acceso al portal a ningún cliente.

---

## Nombre interno en inglés, etiqueta en español

`driver` se muestra como «Conductor / Piloto» y `client` como «Cliente». Los nombres internos **no se traducen**: renombrarlos obligaría a migrar cada usuario y cada comprobación del código a cambio de nada visible.

Si hace falta cambiar cómo se lee un rol en pantalla, se toca la etiqueta en `UserController::roles()`. El nombre interno se queda quieto.

---

## Los duplicados que se eliminaron

Hasta agosto de 2026 existían además `conductor` y `cliente`, duplicados en español creados por el seeder «por retrocompatibilidad».

El desplegable de creación de usuarios ofrecía **seis opciones para cuatro roles**, dos etiquetadas «(legacy)». Nada impedía que los pilotos acabaran repartidos entre `driver` y `conductor`, cada uno con su propio conjunto de permisos — y cualquier consulta que filtrara por uno solo habría dado resultados incompletos sin avisar.

En producción ambos tenían **0 usuarios** en los dos guards, así que retirarlos no afectó a nadie. Lo hace la migración `2026_08_11_200000_remove_duplicate_legacy_roles`, que solo borra si sigue habiendo 0 asignados: si en algún entorno hubiera usuarios, los conserva en vez de dejar a alguien sin permisos en silencio.

**No volver a crearlos.**

---

## Los dos guards

Cada rol se registra dos veces, en `web` y en `sanctum`, porque el panel autentica por Sanctum y Spatie resuelve permisos por guard. Son 5 roles × 2 guards = 10 filas en `roles`.

Al asignar un rol desde el panel, `UserController` sincroniza ambos guards. Asignar solo uno produce un usuario que parece tener permisos y recibe 403.

---

## Pendiente de decisión

**`administrador` tiene hoy exactamente los mismos permisos que `superadmin`.** Ambos reciben la lista completa (`$adminPerms = $permissions`). La única diferencia real es que `CheckPermission` deja pasar a `superadmin` sin comprobar nada, y que las credenciales de integración exigen `superadmin`.

Si la intención es que el dueño del negocio no pueda hacer cosas de desarrollo —purgar registros en físico, tocar ajustes del sistema—, hay que separar las dos listas de permisos. Es una decisión de negocio, no técnica, y por eso está anotada aquí en vez de resuelta.
