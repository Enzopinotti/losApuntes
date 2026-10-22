# B252 — Recuperación de cursores del directorio Mobile

La paginación del directorio Mobile detiene un ciclo si una página devuelve el cursor actual o uno ya visitado. Conserva las organizaciones recibidas, retira la acción de cargar más y muestra que el directorio no pudo completar la paginación. Un fallo transitorio mantiene disponible el mismo cursor para reintentar; una búsqueda nueva reinicia el historial de cursores.

## Validación

- Pruebas del controlador para cursor repetido, ciclo entre páginas y reintento tras fallo transitorio.
- Suite Mobile y TypeScript.
- Exportaciones Expo iOS y Android.
- Prettier y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.
