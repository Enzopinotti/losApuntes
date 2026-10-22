# B258 — Recuperación de cursores de Notificaciones Web

La bandeja de notificaciones detiene tanto la carga manual como la reconciliación periódica cuando encuentra un cursor actual o ya visitado. Conserva las notificaciones recibidas y deduplica por ID; los errores transitorios dejan disponible el cursor para reintentar. Cambiar de autoridad o recargar la primera página reinicia el historial.

## Validación

- Contrato Web Social/Q&A, con pruebas de cursor repetido, ciclos, fin de lista y deduplicación.
- TypeScript, ESLint focalizado y build de producción Web con manifiesto de release.
- Prettier en archivos de producto, higiene del repositorio y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.
