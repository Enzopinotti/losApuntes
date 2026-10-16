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
5. En cualquier conflicto, el script detecta todos los paths no resueltos del orden correspondiente, limpia el merge local, deja evidencia en el `GITHUB_STEP_SUMMARY` y devuelve error. **No usa `-X ours`, `-X theirs`, `--force` sobre refs remotas ni descarta silenciosamente cambios de otro carril.**
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
