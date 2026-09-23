# Correcciones de revisión — 21/09/2026

Base: `aba2c3c`. Cambios locales, sin commit ni publicación.

- Login: se retira la rama inalcanzable que modificaba estado desde el efecto y la redirección duplicada del submit. El destino se resuelve desde `/me`: cliente al portal; personal al panel.
- Prueba cPanel: permite nombrar el reparador manual de storage en mensajes/comentarios; mantiene las prohibiciones de reparadores de esquema, `exec` y el lanzador `runPhpRepair`. No cambia `.cpanel.yml` ni el script de despliegue.
- Portal API: `per_page` validado entre 1 y 100, sin subconsulta innecesaria de paquetes. Resumen COD calculado en SQL, manteniendo el aislamiento por cliente y el saldo no negativo de cada renglón.
- Verificación: lint completo, TypeScript y build del frontend aprobados; login de cliente y administrador comprobado en navegador con respuestas simuladas; 29/29 pruebas backend focalizadas, 155 aserciones, SQLite en memoria. Incluye límites de paginación y totales COD vacíos, propios/ajenos y sobretransferidos.

El frontend y backend del CI remoto siguen mostrando sus fallos anteriores hasta publicar y ejecutar esta tanda. No se ejecutó aquí la suite completa ni UAT autenticado de producción.

Correcciones relacionadas de P14 y actualización del lock de P18 se registran en P17, archivo `actualizaciones/2026-09-21-revision-y-correcciones.md`.
