# B87 — Recuperación canónica de Prettier API sobre la integración B86

Fecha de referencia: 2026-10-16.

## Punto de partida comprobado

- Último `main` al iniciar: `ce9385456904fcd38f5e5a81509013d1a46c17bd`, que incorpora validación criptográfica SigV4 sobre loopback S3.
- Base exacta del carrier: `fix/b86-current-main-mongo-study-fixture-types@f78ad9710db287728c846d9ceff5711d72a64441`, [PR #399](https://github.com/Enzopinotti/losApuntes/pull/399), **16 commits adelante y 0 detrás de main** en la inspección. Está en draft y no se considera mergeado.
- CI original de #399: [verify #38920537363](https://github.com/Enzopinotti/losApuntes/actions/runs/38920537363), **10 jobs críticos PASS; 127 suites API aprobadas y 2 omitidas, sin fallos, 1314 tests aprobados**; [workflow focal #38920537302](https://github.com/Enzopinotti/losApuntes/actions/runs/38920537302), **3/3 jobs PASS** (tipos API, Web formato/lint/tipos y verificaciones de fixtures).
- Problema nuevo visible: Quality Gate se detenía en `apps/api format:check`: **47 archivos de API** incumplían Prettier (Web format ya PASS). Esto impedía que el Quality Gate ejecutara después ESLint, TypeScript, tests y build, aunque varios checks independientes eran verdes.

## Solución y procedencia

- Rama B87 separada derivada del **HEAD exacto de #399**, no de fuentes API antiguas. Formateo de los archivos desde esa propia rama con los scripts originales del repositorio: `pnpm --filter @losapuntes/api format`, Node fijado en `.nvmrc`, `pnpm install --frozen-lockfile`.
- [Job temporal B87 #38925626889](https://github.com/Enzopinotti/losApuntes/actions/runs/38925626889) **SUCCESS**: comprobación de SHA del checkout, `git diff --check`, validación de scope `apps/api/{src,test}/**/*.ts`. La diff resultante tiene **47 archivos TS modificados únicamente por Prettier**.
- El workflow temporal tenía escritura restringida a la propia rama B87 y **fue eliminado** tras completar el commit de formato. No se fusiona ni queda instalado en el PR.
- Se agregó workflow permanente de **solo lectura** `b87-api-format-quality.yml` con jobs independientes para Prettier/tipos API y ESLint estricto, todos anclados a `github.event.pull_request.head.sha`. Esto permite medir las siguientes fallas sin confundir stages no ejecutados.
- No se modificaron `package.json`, lockfile, runtime de S3, rutas Web, configuración de seguridad, tests semánticos, excepciones del audit, flags ni servicios productivos por fuera de reformatear código existente.

## Hallazgo adicional del exact-head B87: guard B83 sensible al formato

- En el primer run completo B87, `apps/web`, `apps/api` y `apps/mobile` pasaron Prettier, y API `check:types` pasó. **Los diez jobs críticos siguieron PASS** con 127 suites ejecutadas y 1314 tests aprobados.
- El Quality Gate avanzó a `apps/api lint` y registró **562 diagnósticos (437 errores y 125 advertencias)**: es el baseline preciso de esta rama integrada, no un delta atribuible a los cambios de formato ni comparable sin control al antiguo B84 de 214 errores. Se requiere saneamiento por archivo en B88.
- El job de #399 `Server clock, claim and artifact expiry guards` falló después de las **5 suites / 88 tests PASS**, ya que `test-account-export-b83-mongo-clock-guard.mjs` verificaba el texto fijo `})) .resolves.toBe(true)`, sin soportar la coma final insertada por Prettier entre la llamada de completitud y el cierre de `expect`.
- El script estructural ahora acepta espacio y coma opcionales **pero sigue exigiendo** `}).resolves.toBe(true)` correctamente encadenado al resultado de `store.complete()` dentro del escenario B82. No se eliminó el guard ni se debilitó su resultado esperado.
- El workflow B87 fue ampliado para ejecutar los guards B83, B84 y B85 tras formato y TypeScript, con evidencia nueva sobre el SHA exacto. No extrapolar el verde de ejecuciones anteriores.
- Auditoría de producción continúa roja por excepción de node-forge vencida en 2026-10-15; sin waiver, extensión ni cambio de dependencia.

## Criterios de cierre y riesgos

1. Aceptación exact-head: `pnpm --filter @losapuntes/api format:check` PASS, `check:types` API PASS, y 10 jobs de cobertura crítica más suite de las funcionalidades CASA/epoch/allowlist sin regresión.
2. Registrar los fallos restantes de **ESLint API** sin modificar `--max-warnings=0`, desactivar reglas ni introducir excepciones de lint.
3. No declarar global `pnpm check` verde si ESLint o el build siguen bloqueados. El job de estilo que preparó la diff tampoco acredita una ejecución de Jest.
4. Los PR históricos #344, #349, #374, #387, #391, #396 y #400 pueden contener snapshots viejos que sobrescriban protecciones nuevas de S3/Mongo. B87 está apilado sobre #399 y exige reconciliar con `main` vigente **antes** de fusionar. Coordinar con otros agentes en los PR respectivos.
5. Auditoría de producción #133: excepción de seguridad vencida el 2026-10-15; #141 mantiene advisory pendiente. **No** prorrogar ni excluir paquetes sin una remediación verificada.
6. Release readiness #353 **HOLD**; `STUDY_PROGRESS_ENABLED` apagado; `ACCOUNT_EXPORT_FORMAT_VERSION=1`; sin levantar la aplicación o desplegar.

Este documento registra la base y el procedimiento, no autoriza merge, deploy ni activación de funcionalidades.
