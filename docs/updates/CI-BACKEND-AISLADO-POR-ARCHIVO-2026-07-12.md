# CI backend aislado por archivo - 12 de julio de 2026

## Problema

La suite completa de PHPUnit podía permanecer ejecutándose indefinidamente en GitHub Actions. Los seeders de pruebas crean envíos y podían activar geocodificación externa real; cuando un proveedor no respondía, la prueba quedaba esperando aunque la funcionalidad financiera fuera correcta.

## Corrección

La clase base de pruebas simula por defecto las respuestas de Google Maps y Nominatim, de modo que ningún fixture puede depender de la red. Las pruebas especializadas de geocodificación reinician esa fábrica y controlan sus propias respuestas simuladas. Además, el workflow `backend-ci` ejecuta cada clase de `tests/Unit` y `tests/Feature` en procesos separados mediante `php artisan test <archivo>` con un límite por clase, para que una dependencia futura no bloquee toda la validación.

Esto no reduce cobertura: ejecuta la misma lista de pruebas, pero evita que un bootstrap global de una clase afecte a la siguiente.

## Validación

- Los siete métodos de `CodSettlementTest` pasaron de forma aislada en local.
- La suite enfocada de rutas, conciliación y devoluciones pasó antes del cambio.
