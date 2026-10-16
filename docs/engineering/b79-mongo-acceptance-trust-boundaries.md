# B79.1 — Mongo acceptance: trust boundaries and strict ESLint

**Fecha:** 2026-10-16. **Base final reconciliada:** `main@a27a4e2a60f3ea993ee2d52e5303a55a33981a49` (incluye B80 write-ahead y B81 abort guard). Carrier consolidado de B79, reemplaza el borrador histórico #382. Tracking: [issue #378](https://github.com/Enzopinotti/losApuntes/issues/378).

## Diagnóstico y alcance

Los tests de integración de `study-progress` y `study-collections` generaban centenares de diagnósticos de ESLint, incluyendo una propagación masiva de `any` desde el virtual `document.id` de Mongoose. La respuesta de `admin().command({hello:1})` también se trataba como tipada sin validar los arrays de la topología. El primer análisis sobre el `main` sin formatear contó miles de incidencias **prettier/prettier**; ese recuento NO se compara contra los errores funcionales.

## Cambios

1. El resultado de `hello` se recibe como `unknown`; se rechaza si no es objeto y se recorren arrays `unknown[]`, manteniendo validación de miembros locales, puerto, primaria y `replicaSet`. Ningún cleanup de base se autoriza hasta validar topología.
2. `users.create(...).id` se recibe como `unknown`; si no es un `string` no vacío se aborta el fixture, nunca se usa como autoridad/owner. El helper `owner()` devuelve `Promise<string>` sin casts de identidad.
3. Se compara el estado de conexión con `ConnectionStates.connected`.
4. Los dobles de `AccountExportService`, Resource API, S3 y Mongo que no hacen `await` devuelven explícitamente `Promise.resolve` o `Promise.reject`. Las inyecciones de fallo mantienen el rechazo observado en las pruebas negativas.
5. Se retiran aserciones redundantes `!` y mocks forzados con `as unknown as`, y se encapsula un matcher asimétrico de fechas de Jest como `unknown` sin cambiar su valor runtime.
6. Prettier Node 24/pnpm 9.15.9 se ejecutó sobre **solo estos dos archivos** mediante un workflow temporal con scope exacto y push protegido por Git. El workflow temporal de escritura fue **eliminado** del carrier final.

## Invariantes

- Las pruebas Mongo siguen siendo opt-in y solo aceptan replica set local sin credenciales; DB aleatoria propia y cleanup únicamente después de comprobar seguridad.
- Se conserva el aislamiento de propietarios, revisión CAS, límite de 16 materias, cierre irreversible, exportación privada y las pruebas B75–B80 agregadas por otros carriles.
- No se modificaron servicios productivos, APIs, lockfile, base real, flags, métricas ni políticas de release.
- No hay `eslint-disable`, `any` nuevo en los límites de confianza, cast global para encubrir tipos, cambio de severidad ni `max-warnings` relajado.

## Evidencia y límites

Antes de limpiar las aserciones y promesas, una ejecución focalizada sobre los **archivos ya formateados** contabilizó 5 errores/0 warnings en Study Collections y 16 errores/0 warnings en Study Progress; la siguiente fase reportó 0 y 1 (el último era un import sin uso, ya retirado). La aceptación final depende del **run exact-head de este carrier consolidado**, con cero diagnósticos ESLint en ambos archivos.

La compilación TypeScript API global sigue bloqueada por errores ajenos al carrier:
- `data-lifecycle/mongo/mongo-account-export.store.spec.ts:265`: TS2352 y TS2493 en mock `updateOne` B80.
- `study-progress/mongo/study-progress-export.reader.spec.ts:104`: TS2353 de fixture Mongo con campo desconocido; corregido previamente en PR #374, todavía no integrado en `main`.

No inferir TypeScript global ni Jest Mongo PASS de un lint focal: requiere reconciliar PRs y usar una réplica local autorizada. Producción/issue #353 sigue HOLD, la excepción #133 vencida continúa bloqueando el audit y #141 permanece abierto.
