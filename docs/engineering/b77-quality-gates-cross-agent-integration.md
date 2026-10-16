# B77 — Integración cruzada de pruebas y seguridad (2026-10-16)

## Base y alcance

Base inicial exacta: `main@96793b0ef9cdb30ac019ef350c415b6e625ac7de` (B75 recuperación S3). Integración aditiva y sin cambios de configuración de seguridad o dependencias; no sustituir HEAD nuevo de `main` con snapshots antiguos.

| Origen | Incorporación | Invariantes |
| --- | --- | --- |
| #351 | `study-collection.service.ts` y spec | CAS de recuperación del recurso inaccesible debe probar revisión e **inclusión ausente** antes de aceptar éxito |
| #370 | `data-lifecycle.module.spec.ts` | doble del epoch del dueño, chequeo previo al commit y aborto si cambia |
| #369 | `study-progress-export.reader.spec.ts` | registros Mongo corruptos entran como `unknown` y el reader los rechaza |
| #369 + B75 | `mongo-account-export-orphan-cleanup.store.spec.ts` | `matchedCount` real para lease `$max`, índice `unique`, prueba idempotente; conservar escenarios B75 |
| #372 | `account-export-assembler.ts` y nuevo spec | fail closed si se registra cualquier contributor fuera de la allowlist global v3 |
| #371 | **NO copiar el test permisivo** | #371 había esperado aceptar `unreviewed.private` en v2; esto contradice la validación preventiva que añade #372 |

## Decisión de seguridad

Un job persistido v1 o v2 selecciona exactamente sus 30/31 secciones, incluso si la aplicación monta la lista v3 **aprobada** de 32. Pero un contributor inesperado ajeno a la allowlist se considera posible fuente privada no revisada, y se rechaza **antes de cualquier byte** en v1/v2/v3. El registro real Nest mantiene su comprobación estricta.

Esta decisión corrige explícitamente la interpretación previa de B76 (#371): aislamiento de la salida no sustituye la validación del registro de fuentes. Conservamos las pruebas de ausencia de secciones, v1/v2 versionados y v3 prepublish.

## Validación requerida

- HEAD exacto de esta rama, ver workflow `verify` de GitHub.
- Confirmar passing de StudyCollectionService CAS, DataLifecycleModule, export versioning, allowlist, orphan-cleanup y malformed Study Progress.
- Reportar **todos** los fallos de CI: Quality Gate, auditoría de dependencias caducada, o Web.
- Comparar `main...head` antes de merge; no confundir mergeability con CI verde.
- No fusionar a `main` o publicar con release issue #353 HOLD; `ACCOUNT_EXPORT_FORMAT_VERSION=1`, study progress apagado.

## PR y carriles

Este PR de integración **no modifica branches de otros agentes** y no reclama sus PR como fusionados. Incluye las correcciones de código/test necesarias, pero las workflows/docs históricas siguen referenciadas en cada PR de origen. Si se decide mergear el carrier integrado, primero reconciliar conflictos con #349 (formato API), #344 (Web) y documentación; cerrar carriers reemplazados **sin merge** y citando evidencia exacta.
