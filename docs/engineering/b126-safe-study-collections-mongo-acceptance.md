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
4. Se mantiene el opt-in `STUDY_COLLECTIONS_TEST_MONGO_URI`. Para evitar el borrado de una base incorrecta, se exige exclusivamente `mongodb://127.0.0.1:27017/?replicaSet=rs0` (sin credenciales, database en la URI, opciones adicionales ni DNS); se verifica además `hello.isWritablePrimary` y cada miembro de la topología **antes** de habilitar `dropDatabase` en la base efímera con UUID.
5. Los jobs read-only de lint/TypeScript ejecutan también la fixture con Mongo desactivado (skips correctamente declarados); **un tercer job nuevo sí levanta MongoDB 7 temporal como réplica rs0 y ejecuta los tests reales**. Al terminar, elimina el contenedor incluso si falla el job. No usa un Mongo ajeno, compartido o productivo.

## Aceptación

Workflow read-only `b126-study-collections-mongo-quality.yml`:
- checkout y aserción del SHA exacto del PR;
- Node desde `.nvmrc` y `pnpm install --frozen-lockfile`;
- Prettier y strict ESLint `--max-warnings=0` del fixture;
- Jest del fixture, con skips explícitos en el job sin Mongo; no se confunden con aceptación real;
- TypeScript API completo en job separado;
- **MongoDB 7 real**: crea réplica `rs0` desechable escuchando solo en `127.0.0.1:27017`, espera PRIMARY, ejecuta Jest/ts-jest con `STUDY_COLLECTIONS_TEST_MONGO_URI` explícita y verifica desde el JSON de Jest **13/13 casos pass, 0 fallos, 0 pendientes**. Incluye los cuatro subcasos parametrizados de carreras transaccionales; el contador está validado contra el manifiesto real;
- Verifica SHA y worktree limpios antes y después, y elimina siempre el contenedor.

### Evidencia ejecutada real

- [Primera ejecución Mongo #39180040757](https://github.com/Enzopinotti/losApuntes/actions/runs/39180040757): **12 PASS / 1 FAIL** (13 casos). El caso de portabilidad v2 descubrió una fixture obsoleta: `AccountExportService` exige tanto `StudyCollectionExportReader` como `StudyProgressExportReader` cuando `ConfigService` está presente. Se conservó la protección productiva y se conectó un **lector real** de progreso a la fixture; no se desactivó el gate.
- [Segunda ejecución #39180180556](https://github.com/Enzopinotti/losApuntes/actions/runs/39180180556): **13/13 Mongo PASS**, sin casos skipped, TypeScript completo PASS y Prettier/ESLint estricto PASS. La comprobación JSON valida exactamente 13 aserciones; Mongo fue levantado y eliminado en la misma corrida.
- El otro carril B126 [PR #448](https://github.com/Enzopinotti/losApuntes/pull/448) ya está integrado en `main@2bd061ce07799fdf1f3a7428241c0d629341aa31`, con cobertura Files/Resources **95.97 %**, 1435 casos PASS y 49/49 de ResourceService.

El `verify` global, los guards de cobertura crítica, la auditoría y los gates de runtime continúan obligatorios. Un éxito focalizado no implica que el repositorio o el release estén verdes; los casos de S3 externo y browser/restore siguen pendientes. La ejecución final después de editar este documento debe verificarse en su **SHA exacto**, no asumir que un run anterior lo certifica.

## Estado de seguridad de dependencias (verificación externa)

La excepción para `node-forge@1.4.0` (`CVE-2026-85393`, #133) expiró en 2026-10-15. A fecha 2026-10-18, la [base de advisories de GitHub](https://github.com/advisories/GHSA-86w9-cpqp-85rv) sigue enumerando **sin versión corregida**; por ello no es apropiado inventar una actualización, extender la excepción ni ignorar el fallo del audit. La remediación debe examinar el árbol de dependencias y el proveedor ascendente de Mobile, y validar una solución real por separado.

**Release #353 sigue HOLD.** `STUDY_PROGRESS_ENABLED` OFF, `ACCOUNT_EXPORT_FORMAT_VERSION=1`; sin despliegue, credenciales productivas ni arranque de servicios compartidos.
