# B239 — Compartir páginas de organizaciones desde Mobile

La pantalla Mobile de una organización permite compartir su enlace de aplicación mediante el menú nativo. El deep link usa el esquema `losapuntes` de Expo Router y se genera solo para IDs UUIDv4 válidos. El mensaje incluye el nombre público y el deep link, sin cuenta, sesión ni contexto académico.

## Validación

- Pruebas del constructor de deep link y rechazo de IDs/rutas inválidos.
- Suite Mobile, TypeScript y Expo export iOS/Android.
- Contrato Web/Mobile de Organizaciones, build Web, formato, higiene y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.
