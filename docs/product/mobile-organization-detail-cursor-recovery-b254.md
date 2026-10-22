# B254 — Recuperación de cursores del detalle Mobile

El detalle Mobile mantiene historiales separados para publicaciones, todos los eventos y eventos próximos. Si una página repite su cursor actual o uno ya visitado, conserva los resultados recibidos, detiene esa lista y muestra el error del directorio. Los errores transitorios dejan el cursor disponible para reintentar y volver a cargar la organización reinicia los historiales.

## Validación

- Pruebas del controlador para cursor repetido, ciclo, reintento y separación de los eventos próximos.
- Suite Mobile, TypeScript y exportaciones Expo iOS/Android.
- Prettier, higiene del repositorio y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.
