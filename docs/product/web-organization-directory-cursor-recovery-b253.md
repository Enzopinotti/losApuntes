# B253 — Recuperación de cursores del directorio Web

La paginación del directorio Web detecta un cursor repetido y ciclos hacia páginas ya visitadas. Conserva los resultados recibidos, detiene nuevas solicitudes y muestra un aviso accesible. Los errores transitorios dejan disponible el cursor actual para reintentar; una nueva búsqueda reinicia el historial de páginas.

## Validación

- Contrato Web de Organizaciones, incluidos cursor repetido, ciclo y cursores válidos.
- TypeScript, ESLint y build Web con manifiesto de release verificado.
- Prettier en los archivos de producto modificados.
- Higiene del repositorio y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.
