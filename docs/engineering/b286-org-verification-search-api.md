# B286 — Filtro opcional de verificación de organizaciones (solo API)

## Funcionalidad
El endpoint público `GET /organizations` permite especificar `verificationState=verified|unverified` además de búsqueda por nombre, tipo, institución, programa, límite y cursor. Es un filtro del resultado público, **no un permiso de visibilidad**: el servidor sigue devolviendo exclusivamente organizaciones con `status: 'active'` y mantiene el límite de 1–50 registros, el orden, el cursor y la atribución al viewer existentes.

La DTO valida `verificationState` exclusivamente con `ORGANIZATION_VERIFICATION_STATES` y `class-validator`. Un valor desconocido (por ejemplo, `pending`) se rechaza en la capa HTTP antes de acceder a Mongo. La capa de dominio pasa el valor sin inferir ni modificar estados; el store añade un predicado de igualdad junto al filtro obligatorio `status: 'active'`.

## Alcance, pruebas y aceptación
Se porta solo el backend de la PR histórica #654. No se traen las pantallas viejas ni el resto de la rama apilada: la UI Web/Mobile y la paginación institucional actuales se conservan intactas. En PRs posteriores se puede incorporar el selector de verificación en ambas plataformas usando este contrato, sin cambiar autenticación o DTOs públicos.

Pruebas añadidas:
- Validación `verified`, `unverified`, y rechazo de valores no reconocidos.
- Propagación del filtro con institución canónica desde el servicio al store.
- Mongo realista con mock de `find(...).sort().limit().lean().exec()` confirma que `status: 'active'` nunca se elimina, que el filtro de verificación se aplica por igualdad y que el límite sigue usando `limit+1`.

Requiere TypeScript/ESLint/Prettier, suite API, Mongo acceptance, Quality Gate, 10 critical coverages, Container runtime smoke y production audit HIGH exact HEAD. Sin migraciones/índices nuevos, auth, cambios de roles, lockfile, dependencias ni bypass de CI. Las HIGH heredadas de node-forge (#133) y Zod (#705) mantienen la publicación en HOLD hasta una remediación real.
