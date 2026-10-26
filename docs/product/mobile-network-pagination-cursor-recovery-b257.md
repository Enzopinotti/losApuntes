# B257 — Recuperación de cursores de Red Mobile

Los perfiles seguidos y las listas de conexiones pendientes y aceptadas mantienen historiales separados. Si el servidor repite el cursor actual o uno ya recorrido, la app conserva y deduplica los resultados, detiene solo esa lista y explica el problema. Un fallo transitorio no consume el cursor y permite reintentar. Recargar la lista o cambiar la autoridad reinicia sus historiales.

## Validación

- Controladores de perfiles seguidos y conexiones: 14/14 pruebas focalizadas, incluidos ciclos, reintento y aislamiento entre listas.
- Suite Mobile completa: 718/718.
- TypeScript Mobile, Prettier focalizado, higiene del repositorio y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.

## Revisión tras reconciliar con main

La dependencia de avatares #638 ya está integrada. La regresión adicional cubre
conexiones aceptadas con ciclo A-B-A, conservación de la fila nueva, deduplicación,
reintento del mismo cursor tras fallo, aislamiento de solicitudes con el mismo
nombre de cursor y reinicio de historiales al cambiar de autoridad.

Los controladores pasan 15/15 pruebas focales; la suite Mobile completa pasa
784/784. TypeScript de producto/tests, Prettier afectado y git diff --check pasan
contra contratos fuente actuales. No se repitió aceptación nativa en dispositivo.
Sin ejecutar ni reintentar CI.
