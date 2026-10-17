# CI-R01 — Ensayo de integración entre carriles sin tocar ramas ajenas

**Fecha:** 16 de octubre de 2026. **Repositorio:** `Enzopinotti/losApuntes`.

## Por qué existe

El trabajo de integración funcional del [PR #374](https://github.com/Enzopinotti/losApuntes/pull/374) (recuperación CAS de Study Collections, owner epoch de exportación, lectores de progreso y orphan queue, y allowlist de contribuidores) y el formato/lint del [PR #377](https://github.com/Enzopinotti/losApuntes/pull/377) modifican varios de los mismos archivos. Aunque cada rama pase pruebas propias, esto no demuestra que las dos convivan correctamente con el `main` actual.

El workflow `Cross-agent integration rehearsal` prueba esa combinación con permisos **solo de lectura**, sin fusionar PR reales y sin trasladar archivos completos de fuentes históricas al main.

## Contrato de ejecución

1. `actions/checkout` fija el SHA exacto del propio PR que introduce el ensayo.
2. Un único `git fetch` obtiene tres referencias explícitas: `main`, `pull/374/head` y `pull/377/head`. Se congelan los tres SHA; el script confirma los valores antes de procesarlos. Si alguno cambia después, esa ejecución sigue identificada con su snapshot y necesita repetición sobre nuevos SHA.
3. La utilidad `scripts/ci/quality-cross-agent-rehearsal.mjs` requiere `GITHUB_ACTIONS=true`, una confirmación de entorno del job y checkout limpio. Nunca hace `git push`.
4. Se intentan ambos órdenes en commits **locales y descartables**:
   - main + #377 + #374
   - main + #374 + #377
5. En cualquier conflicto, el script identifica **qué paso exacto del orden falló** (aplicar #374 o #377), detecta todos los paths no resueltos de ese paso, limpia el merge local, deja evidencia en el `GITHUB_STEP_SUMMARY` y devuelve error. Una colisión contra cambios recientes de `main` no debe describirse erróneamente como colisión entre ambos PR. **No usa `-X ours`, `-X theirs`, `--force` sobre refs remotas ni descarta silenciosamente cambios de otro carril.**
6. Si ambos órdenes son limpios, exige que produzcan **el mismo tree SHA**. Diferencias por orden son un bloqueo de revisión manual, incluso sin conflictos textuales.
7. Solo si lo anterior pasa, se instala el workspace con `pnpm install --frozen-lockfile` y se ejecutan formato Web/API, tipos Web/API, lint Web y las **seis suites API conflictivas**: `study-collection.service`, `data-lifecycle.module`, `account-export-versioning`, `account-export-contributor-allowlist`, `mongo-account-export-orphan-cleanup.store` y `study-progress-export.reader`.

## Alcance y límites

- Este workflow es un **ensayo diagnóstico**. No sustituye el `verify` global, las diez coberturas, auditoría de dependencias, smoke ni gates exact-head posteriores a una integración real.
- No cambia producción, schema Mongo, contratos, auth, políticas de release o lockfile; tampoco levanta Web/API/Mongo/Expo/Docker.
- Si el ensayo falla con conflictos, el siguiente cambio debe ser un carrier reconciliado *semánticamente* a partir del `main` fresco, con tests de owner/fencing y formato nuevo. Reemplazar versiones enteras de ficheros de fuentes antiguas es inaceptable.
- **Seguridad permanece en HOLD**: el `node-forge@1.4.0` transitivo de Expo conserva la excepción caducada y el aviso de `braces@3.0.3` tampoco tiene versión parcheada conocida. No extender fechas, insertar waivers ni cambiar umbrales. Referencias: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- La release [#353](https://github.com/Enzopinotti/losApuntes/issues/353) sigue **HOLD**; `ACCOUNT_EXPORT_FORMAT_VERSION=1` y flags privados apagados hasta aceptación explícita.

## Evidencia requerida

El PR del ensayo incluirá URL de ejecución, `main` SHA, head SHA de #374 y #377, ambos resultados de merge, ficheros en conflicto (si los hay), árbol sintético (si existe), checks ejecutados y resultado final. No afirmar “verde” para ramas ni para `main` a partir de un árbol descartable. La automatización no tiene permiso para aprobar, fusionar ni publicar.

## Primera prueba CI-R01, exact-head

[Run #38900454143](https://github.com/Enzopinotti/losApuntes/actions/runs/38900454143) sobre `1a34556b6cbdbc29a20c29018ae7e8eb671ccce8`: **5/5 tests del reporter PASS**. El ensayo terminó **FAILED, correctamente, por conflictos**. Tres refs realmente verificadas por GitHub:

- `main=f342a530ac6233f48e660c42a7d4c3af83b9b3ea`.
- `#374=ab5503a62a8443c309431edbc07998d5b414ba09`.
- `#377=d9e84e063ea26326b8e7d139af0d3d236c5e01f3`.

**Hallazgo más preciso:** ambos caminos fallaron en su **primer paso**, antes de aplicar el segundo PR. No se puede concluir que #374 y #377 entren en conflicto entre sí hasta reconciliar cada uno con el `main` actual.

| Aplicación inicial sobre main | Resultado |
| --- | --- |
| #377 B78 | conflicto en `apps/api/src/data-lifecycle/domain/account-export-processor.spec.ts` |
| #374 B77 | conflicto en `apps/api/src/data-lifecycle/mongo/mongo-account-export-orphan-cleanup.store.spec.ts` |

Ambos conflictos implican tests de cola S3/retención contra código reciente incorporado en `main`; no son permiso para conservar unilateralmente una versión del archivo. El runner no avanzó a los seis tests API, formato o Web porque **no existe todavía árbol combinado limpio**.

### Siguiente secuencia

1. Reconciliar #374 con el `main` nuevo sin perder escenarios B78/B79 de orphan cleanup.
2. Reconciliar #377 con el `main` nuevo sin perder pruebas B78/B79 de procesador/cola.
3. Volver a ejecutar CI-R01 con los HEAD actualizados. Solo entonces comprobar conflictos *entre* los dos carriers, diferencias entre órdenes y las suites en el merge sintético.
4. Auditoría y `verify` exact-head posterior a integración real siguen pendientes y separados.
