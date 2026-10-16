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

## Criterios de cierre y riesgos

1. Aceptación exact-head: `pnpm --filter @losapuntes/api format:check` PASS, `check:types` API PASS, y 10 jobs de cobertura crítica más suite de las funcionalidades CASA/epoch/allowlist sin regresión.
2. Registrar los fallos restantes de **ESLint API** sin modificar `--max-warnings=0`, desactivar reglas ni introducir excepciones de lint.
3. No declarar global `pnpm check` verde si ESLint o el build siguen bloqueados. El job de estilo que preparó la diff tampoco acredita una ejecución de Jest.
4. Los PR históricos #344, #349, #374, #387, #391, #396 y #400 pueden contener snapshots viejos que sobrescriban protecciones nuevas de S3/Mongo. B87 está apilado sobre #399 y exige reconciliar con `main` vigente **antes** de fusionar. Coordinar con otros agentes en los PR respectivos.
5. Auditoría de producción #133: excepción de seguridad vencida el 2026-10-15; #141 mantiene advisory pendiente. **No** prorrogar ni excluir paquetes sin una remediación verificada.
6. Release readiness #353 **HOLD**; `STUDY_PROGRESS_ENABLED` apagado; `ACCOUNT_EXPORT_FORMAT_VERSION=1`; sin levantar la aplicación o desplegar.

Este documento registra la base y el procedimiento, no autoriza merge, deploy ni activación de funcionalidades.
