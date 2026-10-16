# B83 — Consolidación B82 + B79.1 sobre el candidato integrado

Fecha de referencia: 2026-10-16.

## Fuente de verdad y trazabilidad

- Base de esta rama: `reconcile/b82-pinned-format-on-b81-current-main@e119fd49ff43dcc026f5757d1cfebb4e1282355a`, derivada del main B81 `a27a4e2a60f3ea993ee2d52e5303a55a33981a49`.
- B82 [PR #386](https://github.com/Enzopinotti/losApuntes/pull/386): integración funcional B77 sobre B80/B81, formato actual de Web/API, React Hooks, y gate API TypeScript.
- B79.1 [PR #385](https://github.com/Enzopinotti/losApuntes/pull/385): tipado de respuestas Mongo y owner ID de fixtures, 0/0 hallazgos ESLint en los dos archivos de prueba; ambos archivos tomados por **blob SHA exacto**, no por snapshot anterior de main.
- B79 tracking [issue #378](https://github.com/Enzopinotti/losApuntes/issues/378).
- B82 validado en [focused run #38904352458](https://github.com/Enzopinotti/losApuntes/actions/runs/38904352458): 6/6 suites, 72/72 tests, `pnpm --filter @losapuntes/api check:types` PASS. Este resultado no se extrapola a B83 hasta correr su propia CI.

## Implementación B83 (tres cambios reproducibles)

1. Se preserva la fuente B82; no se cambian los servicios productivos S3, CAS, manifestos ni el frontend.
2. Se incorporan exactamente las dos suites Mongo saneadas de B79.1:
   - `apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts`.
   - `apps/api/src/study-collections/mongo/study-collection-lifecycle.mongo-int.spec.ts`.
   Ambas suites conservan todas las regresiones de B80 presentes en main B81 y solo aceptan réplica Mongo local sin credenciales, con validación de topología antes de permitir limpiar una base temporal.
3. Se incorpora el workflow read-only `b79-mongo-fixture-quality.yml` para comprobar, sobre **SHA exacto**, `ESLint --max-warnings=0` de ambos fixtures y `check:types` API. No hay workflow temporal de escritura ni excepciones nuevas.

## Criterios de aceptación

- GitHub `verify` y workflow focal del mismo HEAD: registrar estado exacto, tipos, suites y número de diagnósticos de API lint, sin mezclar resultados de ramas anteriores.
- La base B82 reportó `499` diagnósticos de API lint en su Quality Gate (390 errores / 109 advertencias); dos fixtures aportaban 172 y 79. Con B79.1 integrado, ambos deben quedar en cero; registrar el nuevo total sin asumir de antemano que el resto ya pasa.
- Cualquier cambio posterior en `main` exige comparación `main...HEAD` y reconciliación previa a merge. PR #383, #385, #386, #374 son fuentes históricas; no fusionar carriers antiguos por separado si B83 los reemplaza.
- No debilitar Prettier, ESLint, TypeScript, dependencias ni excepciones. No activar Study Progress ni cambiar formato de exportación; issue #353 y release prod en HOLD.
- Las pruebas Mongo reales necesitan ejecución opt-in con una réplica aislada; los jobs unitarios sin Mongo no verifican la transacción real.

Este es un carrier de integración en **draft**, no una autorización de despliegue.
