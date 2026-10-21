# B181 — Integrar remediación HTTP con recuperación del smoke real de Mongo

Fecha: 2026-10-21. Estado inicial: PR Draft hacia `main`, sin merge ni despliegue.

## Por qué se prioriza este bloque

La aplicación tiene decenas de bloques funcionales en PR Draft, y la publicación sigue detenida. Dos PR independientes resuelven problemas conectados del **mismo proceso de validación de release**:

- [#495 — B164](https://github.com/Enzopinotti/losApuntes/pull/495) actualiza `follow-redirects` 1.16.0 → **1.16.1** en el lockfile oficial, con integridad SHA-512 comprobada en npm, y añade pruebas HTTP reales de redirección de Axios. Debería corregir **dos HIGH** (#492), sin alterar manifiestos, dependencias directas, API o Mobile.
- [#484 — B156](https://github.com/Enzopinotti/losApuntes/pull/484) reubica **únicamente** el job global `Container runtime smoke` a un runner GitHub Ubuntu 22.04 y añade un chequeo **fail-closed** del kernel antes de levantar MongoDB 8. En runners Ubuntu 24.04 con Linux 6.19, MongoDB 8.0 termina antes de que arranque la API, por SERVER-121912 / SERVER-125742. El runner elegido no sustituye la verificación real de Mongo y no se manipulan sus protecciones de arranque.

Una validación independiente de #495 no resolvía el bloqueo por kernel. Un test de CI corregido en #484 no remediaba los advisories HTTP. **B181 combina literalmente ambos conjuntos de cambios** y exige que ambos se prueben en **un mismo SHA**. No es una funcionalidad nueva ni un bypass de producción: libera la capacidad de comprobar y eventualmente integrar funcionalidades ya desarrolladas.

## Composición reproducible

- Base canónica: `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`.
- Punto de partida: HEAD exacto #495 `b12c23bed5045d652391ac463bc857c15e7d1130`.
- Se recuperaron sin cambios de contenido los cinco archivos exactos de #484 `9a24bfa92410835f04af1122d10a6fc4df934660`.
- Contrato adicional: `scripts/test-b181-security-runtime-integration.mjs` verifica explícitamente que **ambas** protecciones y la auditoría estricta sobrevivan a la composición.
- Workflow B181 exact-head: Node 24 / pnpm frozen, metadata de lock, regresión de headers HTTP 127.0.0.1 → 127.0.0.2, preflight del kernel y build Web. Independientemente, los jobs preexistentes de CI verifican **Mongo primario real**, auth en Chromium, smokes de módulos y producción audit. El formato y el alcance del paquete no se relajan para lograr verde.

## Criterios de aceptación

1. `follow-redirects@1.16.1` es la única versión en packages/snapshots; Axios resuelve esta versión, integridad SHA-512 oficial correcta y `pnpm install --frozen-lockfile` pasa.
2. Tests HTTP locales demuestran que Authorization/Cookie no se fugan entre orígenes y que encabezados de nombre regex especial o formato array quedan protegidos.
3. Kernel CI real es clasificado antes de levantar Mongo, versiones incompatibles o desconocidas fallan antes de empezar; la CI no ignora error.
4. Mongo 8 arranca con `isWritablePrimary` verdadero en el runner compatible, y el workflow global ejecuta browser Auth + 11 smokes HTTP y cleanup.
5. 10 coberturas críticas, `Quality Gate`, build Web/API/Mobile y GitGuardian pasan en ese mismo SHA.
6. Se ejecuta `pnpm audit --prod --audit-level high` **sin `continue-on-error` ni excepciones nuevas**. La meta es eliminar dos HIGH de `follow-redirects` y observar, sin ocultar, las HIGH restantes de `node-forge` (#133) y `braces` (#141).
7. Si el audit aún retorna HIGH, se registra `HOLD`; ningún check parcial significa autorización de release.

## No alcanza este bloque

- No soluciona vulnerabilidades upstream `node-forge` ni `braces`; no inventa nuevas versiones ni hace excepciones.
- No prueba automáticamente PR funcionales pendientes: cada integración futura debe verificar conflicts, revisión de seguridad, API real/Chromium y los cambios acumulados sobre `main`.
- No incluye deploy. Cierre de release #353 requiere auditoría productiva aprobada y aceptación total.
- PR #495 y #484 conservan sus commits originales; B181 es una prueba combinada. Al integrarse, reconciliar ambos PR para no aplicar dos veces sus archivos.

## Evidencia a completar con GitHub Actions

Registrar SHA candidato exacto, Node24 B181, B164 registry/loopback, B156 bootstrap, `Container runtime smoke`, total de HIGH y estado global. No afirmar éxitos antes de ver el resultado del runner.
