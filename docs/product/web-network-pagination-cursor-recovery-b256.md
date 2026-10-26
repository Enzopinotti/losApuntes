# B256 — Recuperación de cursores de Red Web

Las listas de perfiles seguidos y relaciones de conexión conservan historiales de cursor independientes. Si una respuesta repite el cursor actual o uno ya visitado, la lista conserva los perfiles, elimina duplicados por identidad canónica, detiene solo su propia paginación y anuncia el error. Los errores transitorios no consumen el cursor y permiten reintentar; recargar la red reinicia ambos historiales.

## Validación

- Contrato de presentación de Red y regresiones de avatares; pruebas del helper para cursores repetidos, ciclos, cursores nuevos y deduplicación.
- TypeScript y ESLint focalizado Web.
- Build de producción Web con manifiesto de release.
- Prettier en los archivos de producto, higiene del repositorio y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.

## Revisión de integración

El escenario Chromium de Red conserva las pruebas de avatares y ahora cubre
ciclos A-B-A en seguidos y conexiones con los mismos nombres de cursor,
deduplicación por identidad canónica, conservación de la tercera fila recibida
y desaparición de la paginación solo en la lista afectada. Un 500 en seguidos
conserva la primera fila y reintenta exactamente el mismo cursor.
No se envían escrituras API; todas las respuestas se simulan localmente.

Contratos de Red y avatares y build Vite aprobados. Metadatos de despliegue
unavailable. Sin ejecutar ni reintentar CI.
