# B188 — Revalidación de progreso guardado antes de devolverlo al estudiante

**Estado:** implementación propuesta mediante PR Draft, sin merge ni despliegue.
**Base auditada:** `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`.
**Trazabilidad:** B61 / issue #353; NFR-SEC-001, NFR-PRIV-001, NFR-REL-001 y PLAT-FR-006/007.

## Incidente potencial identificado en el código

B61 valida con `parseStudyProgressPlan` toda escritura `PUT` y usa un índice único por dueño y materia. Pero `StudyProgressService.get` utilizaba `lean<StudyProgress>()` y proyectaba `record.plan` directamente, **sin parsearlo de nuevo** antes de enviarlo por HTTP. Un documento malformado por migración, una versión antigua, un bug del adapter o intervención externa podía contener campos que el contrato de lectura no permite.

Este bloque **no considera un resultado de Mongo un permiso** ni añade grants. La autorización sigue proviniendo del guard de sesión y del `ownerUserId` de la consulta.

## Corrección aislada

- `StudyProgressService.present(record, subjectId)` exige que el documento corresponda a la materia solicitada, una revisión entera positiva dentro del máximo del DTO, fechas Mongo válidas y `createdAt <= updatedAt`.
- Aplica el **mismo parser canónico v1** que la escritura: esquema cerrado, normalización de strings, tareas acotadas y sin URLs privadas ni tokens.
- Sólo devuelve el `plan` revalidado, la revisión y `updatedAt`, nunca el documento Mongo entero ni etiquetas de terceros.
- Ante corrupción retorna un **500 seguro** `STUDY_PROGRESS_STORED_INVALID`; no 422 (que atribuiría el problema a una solicitud válida del estudiante), 404 ficticio, estado parcial ni el payload malformado.
- Conserva 404 para ausencias y propaga errores de base de datos sin afirmar éxito.
- La ruta de `save` también utiliza la proyección revalidada, sin modificar el CAS transaccional de escritura.

## Pruebas

`apps/api/src/study-progress/study-progress.service.spec.ts` cubre proyección normalizada, contaminación top-level y anidada, materias cruzadas, revisión corrupta, timestamp inválido, ausencia y caída de Mongo. El workflow B188 ejecuta los tests reales en Node24 junto al parser v1, guard de feature y lector de exportación v3; valida ESLint, Prettier, TypeScript y fuente inmutable del PR.

**No afirmar PASS hasta observar la ejecución exact-head real.** Los tests del B188 no reemplazan Mongo/S3/HTTP/browser E2E ni controles globales.

## Compatibilidad y condiciones de release

No cambia contratos HTTP para datos válidos, endpoints, rutas, índice, serialización v1/v2/v3, manifiesto de exportación, modelo físico, políticas de retención, feature flags, lockfile ni dependencias. Los clientes pueden tratar `STUDY_PROGRESS_STORED_INVALID` como una lectura temporalmente no disponible y conservar cualquier borrador local sin borrado automático.

`STUDY_PROGRESS_ENABLED=false` en producción continúa siendo obligatorio. Issue #353 permanece abierto por aceptación multidispositivo, backup/restore, retención, datos cerrados y evidencia operativa. Vulnerabilidades HIGH pendientes #133/#141 siguen bloqueando release. No introducir excepciones ni fusionar sin verificación exacta.
