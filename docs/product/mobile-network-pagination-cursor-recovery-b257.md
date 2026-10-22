# B257 — Recuperación de cursores de Red Mobile

Los perfiles seguidos y las listas de conexiones pendientes y aceptadas mantienen historiales separados. Si el servidor repite el cursor actual o uno ya recorrido, la app conserva y deduplica los resultados, detiene solo esa lista y explica el problema. Un fallo transitorio no consume el cursor y permite reintentar. Recargar la lista o cambiar la autoridad reinicia sus historiales.

## Validación

- Controladores de perfiles seguidos y conexiones: 14/14 pruebas focalizadas, incluidos ciclos, reintento y aislamiento entre listas.
- Suite Mobile completa: 718/718.
- TypeScript Mobile, Prettier focalizado, higiene del repositorio y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.
