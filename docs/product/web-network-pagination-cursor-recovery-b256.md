# B256 — Recuperación de cursores de Red Web

Las listas de perfiles seguidos y relaciones de conexión conservan historiales de cursor independientes. Si una respuesta repite el cursor actual o uno ya visitado, la lista conserva los perfiles, elimina duplicados por identidad canónica, detiene solo su propia paginación y anuncia el error. Los errores transitorios no consumen el cursor y permiten reintentar; recargar la red reinicia ambos historiales.

## Validación

- Contrato de presentación de Red y regresiones de avatares; pruebas del helper para cursores repetidos, ciclos, cursores nuevos y deduplicación.
- TypeScript y ESLint focalizado Web.
- Build de producción Web con manifiesto de release.
- Prettier en los archivos de producto, higiene del repositorio y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.
