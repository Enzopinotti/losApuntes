# B261 — Compartir perfiles públicos desde Web (reconciliado)

**Estado:** CANDIDATE, sin merge ni release autorizados.

## Fuente y límite de producto

Se recuperó la intención de la PR histórica #629 (B220) sobre `main@32ef65d9149b9e3320cda97166b10ff29c841efb`, conservando el encabezado público más nuevo, los avatares y las acciones sociales existentes. No cambia el modelo ni los endpoints de Profile o Social.

La acción aparece únicamente cuando el servidor proyecta un `about.displayName` público. Construye una URL `/p/:profileId` a partir del UUIDv4 canónico de Profile y del origen actual validado; no utiliza datos de sesión ni se inventa una proyección pública. Si el navegador soporta compartir nativamente usa `navigator.share`; si no funciona, intenta el portapapeles. Ante ambos fallos presenta un campo seleccionable para copiar manualmente. La cancelación de la hoja de compartir nativa no se considera error. El resultado se anuncia con `role=status` o `role=alert`.

## Criterios de aceptación y QA

- UUID no canónico, origen de esquema no web, URL con credenciales o URI inválida son rechazados.
- El perfil privado no presenta botón de compartir aunque la ruta sea pública.
- Acciones de seguir/conectar requieren autenticación como antes y no quedan ocultas.
- Campo fallback puede seleccionarse; controles tienen tamaño táctil mínimo de 44 px.
- `pnpm test:web-public-profile-social`, TypeScript Web, lint/formato, build y navegador real deben pasar sobre HEAD exacto.
- Security audit HIGH, covs y container runtime smoke siguen siendo gates separados de una prueba estática.

Requisitos: PROF-FR-003, PROF-FR-009, NFR-PRIV-001, NFR-A11Y-001, PLAT-FR-007. Sin cambios de lockfile, API/Auth, storage, permisos, feature flags, signed links ni deploy. HIGH #133 y #705 y release #353 permanecen HOLD. La PR #629 histórica no se fusiona ni cierra hasta que el carrier vigente sea validado y reconciliado.
