# B255 — Recuperación de cursores del detalle de Organización Web

El detalle Web mantiene historiales separados para publicaciones, todos los eventos y eventos próximos. Si el servidor repite el cursor actual o devuelve uno ya recorrido, la página conserva los resultados recibidos, detiene únicamente esa lista y muestra un error accesible. Los fallos transitorios dejan disponible el mismo cursor para reintentar. Recargar el detalle reinicia publicaciones y todos los eventos; actualizar Próximos reinicia solo su propio historial.

## Validación

- Contrato de Organizaciones Web, incluyendo pruebas del helper para cursor actual, ciclo, cursor nuevo y fin de lista; regresiones iCalendar incluidas.
- TypeScript, ESLint focalizado y build de producción Web con manifiesto de release.
- Prettier para los archivos de producto, higiene del repositorio y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.
