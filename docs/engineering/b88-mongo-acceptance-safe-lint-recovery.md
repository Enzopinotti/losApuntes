# B88 — Restauración tipada de aceptación Mongo sobre B87 integrado

Fecha: 2026-10-16.

## Base y diagnóstico

- Punto de partida exacto: `fix/b87-api-prettier-on-b86-integrated-20261016@3a538f53bc5a5aed622f3de15b0455c2fe707722`, PR [#403](https://github.com/Enzopinotti/losApuntes/pull/403), apilado sobre [#399](https://github.com/Enzopinotti/losApuntes/pull/399) y `main@ce9385456904fcd38f5e5a81509013d1a46c17bd`. No se toma un snapshot antiguo del `main`.
- [Verify B87 #38926938744](https://github.com/Enzopinotti/losApuntes/actions/runs/38926938744): Web/API/Mobile Prettier PASS, 10 jobs críticos PASS, 127 suites Jest aprobadas, 1314 tests aprobados. API strict lint **562 diagnósticos: 437 errores, 125 advertencias**. Un recuento focal del log ubicó 230 diagnósticos en `study-progress.mongo-int.spec.ts` y 79 en `study-collection-lifecycle.mongo-int.spec.ts`.
- Correcciones previamente aceptadas en [#385](https://github.com/Enzopinotti/losApuntes/pull/385), B79.1, fueron verificadas en ese momento en ambas rutas, pero su código de Study Progress precede la aceptación S3 B82–B86.

## Método: reconciliación por bloques, no reemplazo histórico

Se compararon los dos archivos contra los blobs B79.1 `eef2b572534eb264f50ab72cf218eb498a07e136` utilizando una alineación por líneas normalizadas, revisada por tipo de cambio.

- **Study Collections:** 13 bloques semánticos revisados, todos dedicados a validación de `hello` de Mongo como entrada desconocida, ID de propietario real, `ConnectionStates.connected`, corrección de contratos Promise de mocks, aserción redundante y rechazo de auditoría. El archivo no tiene adiciones B82–B86 en esa ruta.
- **Study Progress:** 26 bloques seleccionados del B79.1 aplicados al árbol actual; **ocho bloques divergentes recientes permanecen** tal como venían: imports del adaptador S3, cambios B84 de reloj primario y elegibilidad, 583 líneas de regresiones B82 y 399 líneas de B86 S3 loopback/ACK. Se preservan las pruebas de dueño, revocación de lease, recuperación de S3 PUT, orphan ledger y respuesta 503.
- Se conserva el contrato asincrónico usando `Promise.resolve/reject`, sin `async` ficticio; los matchers `expect.any(Date)` siguen evaluándose en runtime, pero entran como `unknown` a objetos tipados. Los ID de Mongo se validan como `string` antes de usarse.
- Se recibió el formato canónico de Node/`pnpm --frozen-lockfile` mediante [formatter aislado #38936605271](https://github.com/Enzopinotti/losApuntes/actions/runs/38936605271). Su workflow tenía escritura **solo en una rama auxiliar** `tmp/b88-mongo-fixtures-prettier-20261016` y **no forma parte del PR**. El carrier conserva los dos specs, un guard estructural B86 compatible con Prettier, CI de solo lectura y este documento.

## Correcciones finales incorporadas

- La primera CI B88 redujo la carga de ESLint de **309 diagnósticos en los dos archivos Mongo a 4 errores / 0 warnings**, todos en dos mocks nuevos del `fetch` utilizado en regresiones S3 B86. Los dos callbacks se tiparon correctamente y ahora devuelven `Promise.resolve(Response)` o `Promise.reject(Error)`, conservando el contrato de `fetch` sin simular `async`/await que no existe. La URL se valida desde el tipo `string`, `URL` o `Request`, no mediante `String(object)`.
- `scripts/test-account-export-b86-guard.mjs` verificaba subcadenas rígidas de un solo renglón. Sus patrones ahora permiten **solo diferencias de espacios y saltos de Prettier**, manteniendo inalterados los valores de `orphanRetries: 1`, `orphanAuthorityBlocked: 0`, `orphanDeleted: 1`, `orphanPreserved: 1` y la generación esperada en `toBe(generation)`.
- El workflow de solo lectura exige aún Prettier y ESLint estrictos para ambos archivos, TypeScript de API y los guards B83–B86. Los tests de Mongo requieren una réplica aislada habilitada por variables específicas; sin ella se omiten explícitamente, **no equivalen a aceptación real**.
- Medición sobre el código B88 antes de un posible commit documental posterior: strict lint focal **0 errores / 0 warnings**, TypeScript API PASS, guards B83–B86 PASS, global strict API lint **253 errores / 0 warnings**, 10/10 critical coverage PASS. El Quality Gate y la auditoría de producción continúan bloqueados. Revalidar siempre sobre el HEAD final del PR.

## Invariantes de seguridad y privacidad

1. Las suites con Mongo real son *opt-in*: solo aceptan `mongodb://`, host local, sin credenciales, topología de réplica verificada y base temporal única. Un failure de verificación nunca habilita `dropDatabase()`. En ausencia de URI, las pruebas reales son skipped; no presentar tal omisión como evidencia de operaciones reales.
2. `account-export-processor`, almacenamiento S3, esquemas y stores productivos **no se modifican** por este bloque. Tampoco se despliegan ni se levantan servicios.
3. No cambiar `ACCOUNT_EXPORT_FORMAT_VERSION=1`, `STUDY_PROGRESS_ENABLED` OFF, ni excepciones de seguridad. Issue [#353](https://github.com/Enzopinotti/losApuntes/issues/353) permanece **HOLD**.
4. No eliminar tests, comentarios de escenarios B82–B86, comprobación CAS/epoch o expectativas de aislamiento. Mantener `--max-warnings=0`, sin `eslint-disable` ni `any` nuevos.
5. El carrier es **stacked sobre #403 y #399**, no debe fusionarse por separado a `main` hasta nueva reconciliación y CI exact-head.

## Gates de aceptación

Workflow read-only `b88-mongo-boundary-lint.yml` valida el SHA exacto de la PR, Prettier/ESLint focal, TypeScript API, guards B83–B86 y carga de ambos specs Mongo (con skip explícito si no hay réplica). `verify` global también se ejecuta; un rojo posterior de API strict lint, build o audit debe informarse sin extrapolar green.

Sigue bloqueando la auditoría de dependencias: excepción `node-forge` vencida 2026-10-15 (#133) y trabajo #141. No prorrogar la excepción automáticamente.
