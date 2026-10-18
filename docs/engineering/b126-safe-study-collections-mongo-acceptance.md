# B126 — Reconciliación segura de aceptación Mongo de Study Collections

**Fecha:** 2026-10-18. **Base exacta:** `main@acc9f2084268a3269c2348b59d04e84b787e49cd` (B124 export strict TS). **Alcance:** un fixture de pruebas Mongo, CI de lectura y este registro. **No** ejecuta operaciones de producción.

## Por qué no fusionar los PR históricos

- [#434](https://github.com/Enzopinotti/losApuntes/pull/434), [#437](https://github.com/Enzopinotti/losApuntes/pull/437), [#445](https://github.com/Enzopinotti/losApuntes/pull/445) y otros tienen padres diferentes al `main` de hoy. #445 incorpora formateo amplio Web/API y correcciones de hooks; no es un reemplazo de este bloque.
- La versión actual del test B50 en `main` coincidía con el blob `3025955f5b0fe2f4480282aeac31b00364ec58e8`, mientras la corrección B79.1 previamente revisada tenía el blob `3a2daf2bd839e8da36b332cd4d18513cda33be11`.
- La reconciliación se hizo **solo** para `apps/api/src/study-collections/mongo/study-collection-lifecycle.mongo-int.spec.ts`; no se trajo código de stores, controlador, reader, archivos S3, tablas del dominio, Web o Mobile. Los tests B50 siguen siendo los mismos casos de protección de cierre, CAS y exportación.

## Cambios de seguridad y tipado

1. El resultado de `admin().command({hello:1})` se recibe como **`unknown`** y se valida antes de extraer miembros de la réplica. Se rechaza una respuesta que no sea objeto, un miembro no-string o host inesperado y una topología no primaria. No se amplía la lista de hosts permitidos.
2. Se comprueba la topología real de la réplica **antes** de marcar `verifiedLocalReplica=true`. En `afterAll` solo se admite `dropDatabase` si se verificó la réplica exclusiva local y `connection.readyState === ConnectionStates.connected`. Si falla la verificación, la base jamás debe destruirse desde el test.
3. El ID de usuario persistido se valida como string no vacío. Los mocks que devuelven resultados de `Promise` o `Promise.reject` no necesitan `async` ficticio, y los matchers asimétricos de Jest se encapsulan como `unknown` en vez de propagarse como `any`.
4. Se mantiene el opt-in `STUDY_COLLECTIONS_TEST_MONGO_URI`. No se suministra una URI en CI: los tests de integración reales quedan **skipped**, no certificados. Una ejecución con réplica real requiere infraestructura local aislada y aprobación explícita.

## Aceptación

Workflow read-only `b126-study-collections-mongo-quality.yml`:
- checkout y aserción del SHA exacto del PR;
- Node desde `.nvmrc` y `pnpm install --frozen-lockfile`;
- Prettier y strict ESLint `--max-warnings=0` del fixture;
- Jest del fixture, con skips explícitos si no hay Mongo autorizado;
- TypeScript API completo en job separado.

El `verify` global, cobertura crítica, auditoría y gates de runtime continúan obligatorios. Un éxito focalizado **no significa** que el repositorio esté verde ni reemplaza aceptación real de réplica o S3.

## Estado de seguridad de dependencias (verificación externa)

La excepción para `node-forge@1.4.0` (`CVE-2026-85393`, #133) expiró en 2026-10-15. A fecha 2026-10-18, la [base de advisories de GitHub](https://github.com/advisories/GHSA-86w9-cpqp-85rv) sigue enumerando **sin versión corregida**; por ello no es apropiado inventar una actualización, extender la excepción ni ignorar el fallo del audit. La remediación debe examinar el árbol de dependencias y el proveedor ascendente de Mobile, y validar una solución real por separado.

**Release #353 sigue HOLD.** `STUDY_PROGRESS_ENABLED` OFF, `ACCOUNT_EXPORT_FORMAT_VERSION=1`; sin despliegue, merge ni arranque de servicios.
