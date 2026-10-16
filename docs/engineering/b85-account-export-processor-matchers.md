# B85 — Contrato de test del processor de exportación (Jest + S3 privado)

**Fecha:** 2026-10-16. **Base exacta:** `main@070a10a0f32d404dc5a6be04014ba58a7eaba6b3` (B83 Mongo server-time lease fence). **Carrier:** `test/b85-export-processor-opaque-matchers-clean-20261016`.

## Problema

El procesador de exportación tiene pruebas de atomicidad y privacidad S3 con comparaciones anidadas de `expect.any(Date)` y `expect.objectContaining(...)`. Jest las evalúa correctamente en runtime, pero las declara como `any`, y `@typescript-eslint/no-unsafe-assignment` detecta propagación de ese tipo hacia objetos de aserción de completitud, revocación, recuperación y reintentos. Cambiar las expectativas a una comparación menos precisa podría ocultar regresiones.

## Decisión

Se mantienen **los mismos matchers asimétricos de Jest**, encapsulados en constantes de tipo **`unknown`**, para que los objetos de comprobación no reciban `any`:

- `anyDateMatcher`: exige realmente una instancia de `Date`, no cualquier objeto ni un string.
- `expectedV2Result`: exige `formatVersion=2`, `sectionCount=31`.
- `expectedV3Result`: exige `formatVersion=3`, `sectionCount=32`.

Se conservaron el alcance y las restantes condiciones de todos los `toHaveBeenCalledWith` y `expect.objectContaining`; solo cambia el tipo estático del matcher anidado. No se introducen `as any`, `eslint-disable`, modificaciones del matcher runtime ni cambios de productos.

## Aislamiento multiagente

- Base directa del `main` nuevo; no se copiaron suites del histórico #387/#391 ni snapshots S3 anteriores.
- Se preservan las pruebas B82 de revocación exacta de generaciones, y B83 de autoridad de lease mediante tiempo de Mongo. Código productivo de `account-export-processor.ts`, `mongo-account-export.store.ts` y S3 **intacto**.
- PR #390 y #391 trabajan sobre `account-export.service.spec.ts`, no sobre este processor. PR #388 trabaja en guards, planes y versioning; sin solapamiento con este archivo.
- Un formateador temporal con permisos de escritura restringidos **solo a la rama B85** generó el texto Prettier en [GitHub Actions #38912211943](https://github.com/Enzopinotti/losApuntes/actions/runs/38912211943). Ese workflow temporal NO está incluido en el carrier limpio.

## Pruebas de aceptación

El workflow read-only `b85-export-processor-quality.yml` valida el **HEAD exacto** con Node desde `.nvmrc` y pnpm lockfile congelado:

1. Prettier `--check` del único test.
2. ESLint estricto, cero errores/cero warnings, sin excepciones.
3. Jest completo de `account-export-processor.spec.ts` incluyendo S3, claimer lease, expiración, cleanup y carreras de completitud.
4. TypeScript de API como job **independiente**, para poder atribuir al repositorio los errores de fixtures ajenos sin ocultar los resultados de Jest.
5. `verify` general y auditoría de supply chain se mantienen como condiciones de integración separadas, con evidencia del mismo SHA.

Nunca declarar PASS general por una sola suite. Si `main` avanza, reconciliar y ejecutar tests sobre el nuevo HEAD antes del merge.

## Gates no negociables

- Release [#353](https://github.com/Enzopinotti/losApuntes/issues/353) **HOLD**, `STUDY_PROGRESS_ENABLED` apagado.
- Mantener `ACCOUNT_EXPORT_FORMAT_VERSION=1`; no modificar export de privacidad ni activar funciones nuevas.
- Mantener audit sin excepciones nuevas: [#133](https://github.com/Enzopinotti/losApuntes/issues/133) y [#141](https://github.com/Enzopinotti/losApuntes/issues/141) no están resueltos por B85.
- No usar datos de producción, no ejecutar runtime/deploy ni pruebas con Mongo real sin una réplica local aprobada.

El carrier permanece **DRAFT** hasta CI y reconciliación final.
