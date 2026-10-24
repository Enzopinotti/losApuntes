# B186 — Ensayo exact-HEAD de integración Home/Auth + Mongo + supply chain

**Fecha:** 22 de octubre de 2026. **Base:** `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`.

## Objetivo

Verificar **en el mismo árbol de código**, sin modificaciones permanentes a `main`, que las mejoras recientes de las pantallas Web funcionan junto con el arreglo de MongoDB 8 y la corrección de `follow-redirects`. Cada PR individual ya tenía QA focalizada, pero no había evidencia conjunta específica para B183, B184 y B185. Estos últimos editan independientemente `package.json`, con riesgo de sobrescribir pruebas al fusionar.

## PRs congelados y orden

| PR | SHA remoto exacto | Funcionalidad |
| --- | --- | --- |
| [#484](https://github.com/Enzopinotti/losApuntes/pull/484) | `9a24bfa92410835f04af1122d10a6fc4df934660` | Ubuntu22.04 compatible con MongoDB8 |
| [#495](https://github.com/Enzopinotti/losApuntes/pull/495) | `b12c23bed5045d652391ac463bc857c15e7d1130` | Parches upstream de `follow-redirects` |
| [#519](https://github.com/Enzopinotti/losApuntes/pull/519) | `32036334d2a4d05476469ed47d3ca0ebb656693a` | Apartar/deshacer elementos del inicio |
| [#520](https://github.com/Enzopinotti/losApuntes/pull/520) | `05df4506d09f235dc8f62c6ea0af07ac4e6bfcd2` | Reenvío de verificación seguro |
| [#521](https://github.com/Enzopinotti/losApuntes/pull/521) | `8d257d7ecd3f4ba64c105ff0eafb3b0c41533964` | Contraseñas mostradas voluntariamente |

El orden, las ramas y los SHA se especifican sin variables en `scripts/ci/b186-candidates.json`; son condiciones de aceptación. Si `main` o cualquiera de las ramas avanza, el ensayo **falla y solicita una revisión**, sin usar otro commit.

## Composición efímera

El ejecutor `b186-compose-candidates.mjs` (derivado del reconciliador adversarial verificado en B173) hace checkout de su HEAD exacto sin credenciales persistidas y verifica por `git ls-remote` cada HEAD externo, su ancestralidad frente a `main` y el repositorio limpio. Crea un worktree detached en directorio temporal y realiza commits de merge locales con identidad, orden de padres y fecha deterministas. No ejecuta `push`, no mergea PRs remotamente y no modifica la rama fuente. Emite la identidad del commit compuesto y del tree completo para comparar los **tres jobs independientes**.

Los conflictos distintos de `package.json` bloquean el proceso sin resolver automáticamente. Para los tres PRs Web, se permite solamente **añadir una declaración de test y una invocación al test general por PR**, preservando sin modificaciones las dependencias, auditorías, scripts existentes y el orden de los controles base. Si una rama altera otra propiedad del manifest, elimina un test o intenta una excepción: **FAIL CLOSED**. Hay pruebas adversariales para verificar esta propiedad y detectar duplicados, cambios de checksum semántico, scripts extras y falsos positivos.

## Tres puertas separadas de QA

1. **B186 composed-quality:** instalación pnpm9 `--frozen-lockfile`, suites B183/B184/B185, pruebas de seguridad de `follow-redirects`, `pnpm check` completo y **Chromium real** para los tres journeys: Inicio/invitado, reenvío de verificación, Login/Registro/Recuperación/Seguridad. Se comprueba HEAD y árbol limpio. La prueba de browser usa solo loopback y no publica credenciales.
2. **B186 composed-runtime:** runner Ubuntu 22.04 con preflight de kernel, contenedores reales de MongoDB8/API/workers/storage, `pnpm runtime:smoke`, logs de fallas y `pnpm runtime:down` incondicional para limpiar.
3. **B186 composed-audit:** verificación sin waivers ni exceptions y `pnpm audit:prod` **obligatorio** sobre el lockfile compuesto. La corrección #495 debería eliminar los dos HIGH de `follow-redirects`, pero **no** los avisos #133 (`node-forge`) ni #141 (`braces`), que continúan pendientes de remediación genuina.

El resultado de calidad/runtime **no certifica el release** si la auditoría permanece roja. Ni siquiera una composición totalmente verde certifica el HEAD de `main` porque el commit compuesto existe solo en un runner temporal.

## Criterios de cierre

- Cinco ramas verificadas con SHA exacto, cero conflictos sin revisar, los tres tests Web conservados en el comando raíz, mismo SHA/tree compuesto en tres jobs.
- Quality Gate monorepo, Chromium y runtime PASS; auditoría: el resultado real, sin supresiones.
- Documentar todas las fallas, distinguir infraestructura del código, y no fusionar ni desplegar.
- Los PR originales permanecen Draft. **Release #353 HOLD** hasta el verdadero arreglo de advisories HIGH, integración autorizada y verificación exacta del main efectivo.

**No hay escritura remota, merge a main, publicación, waiver o autorización de release.**
