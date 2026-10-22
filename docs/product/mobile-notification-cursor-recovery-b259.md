# B259 — Recuperación de cursores de Notificaciones Mobile

La bandeja Mobile conserva y deduplica las notificaciones al paginar. Si el servidor repite el cursor actual o uno ya recorrido, la carga manual y la reconciliación periódica detienen esa lista y muestran un error explicativo. Los fallos transitorios no consumen el cursor y permiten reintentar; recargar o cambiar la autoridad reinicia el historial.

## Validación

- Controlador de Notificaciones: 15/15 pruebas focalizadas.
- Suite de pruebas Mobile ejecutada con `tsx`: 716/716.
- TypeScript de producción, Prettier focalizado, higiene del repositorio y `git diff --check`.

El comando `pnpm --filter @losapuntes/mobile test` sigue detenido por un error previo en `apps/mobile/test/profile-controller.test.ts`: su preset `"default"` no corresponde a `ProfileCoverPreset`. Ese archivo no cambia en este bloque.
