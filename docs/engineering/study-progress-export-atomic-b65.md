# B65 — Atomic Study Progress export completion and S3 reconciliation

**Estado:** implementación integrada como bloque incremental; release gate #353 sigue en HOLD. Baseline al iniciar: `main@fdec086b8d2f1c6013110a1be48ab64d98652076`.

## Incidente de consistencia que aborda

B63 evita aceptar un job v1/v2 como completo si el dueño guardó progreso en el proceso de solicitarlo. B64 añade una revisión monótona `User.account_lifecycle_revision` al inicio de montar v3 y un control **antes del `sink.commit` S3**. Sin B65, entre este control y el `AccountExportService.complete` podía confirmarse un nuevo progreso, dejando un archivo S3 con snapshot viejo pero un job durable `completed`.

B65 agrega **dos barreras adicionales, complementarias**:

1. El `AccountExportProcessor` captura la revisión del usuario antes de iniciar v3 y la revalida **después de completar S3**, antes de solicitar el commit durable. Es una verificación fuera de Mongo, útil para detectar cambios en el intervalo S3.
2. `MongoAccountExportStore.complete` confirma **en una sola transacción Mongo** el fence de revisión del dueño y el cambio de estado del job. Para v3, ambas escrituras usan la **misma sesión**. Si la revisión cambió, la transacción falla sin completar el job; si el claim se perdió/expiró, se revierte el incremento del usuario y devuelve `false`. El `User` es la misma fila de autoridad que toca transaccionalmente `StudyProgressService.save/remove` y account closure. El CAS del trabajo exige además `userId: ownerUserId`: no puede finalizar la exportación de una cuenta usando el epoch de otra.

## Invariante y alcance

Una exportación v3 sólo se marca como completada cuando la lectura de progreso durante el stream sigue siendo compatible con el epoch capturado y **ninguna escritura autorizada de progreso ganó la carrera antes de la transacción de finalización**.

Al completar v3 se incrementa la revisión del usuario dentro de la transacción, como write fence y no como modificación del progreso. La comparación del primer valor `0` acepta usuarios legados con revisión ausente o cero. El update filtra cuenta activa; si el dueño cerró la cuenta, el cierre no puede quedar desplazado por una exportación.

Se preserva por completo el contrato anterior para v1/v2: sin epoch de progreso, sin transacción nueva y sin cambios en sus 30/31 secciones. v3 conserva 32 secciones, la autorización por propietario y la validación de SHA-256/longitud de S3.

**Este control no garantiza snapshot global de las 32 secciones.** Otros dominios que no comparten el fence pueden cambiar mientras se genera el archivo. Tampoco convierte el artefacto en una representación en tiempo real: si el usuario modifica el progreso **después** de la transacción de completado, el archivo representa correctamente un estado histórico.

## Resultado incierto del commit y limpieza segura

- **Mutación detectada antes del intento de completado Mongo:** se sabe que no existe job completado; se borra solamente la generación S3 del claim, se aborta o reintenta según el contrato del worker.
- **`AccountExportEpochConflictError` desde transacción Mongo:** es un rechazo confirmado, sin trabajo completado; se puede borrar su generación S3.
- **Claim vencido, `complete() === false`:** se elimina únicamente su generación; el nuevo claim puede continuar sin que el anterior publique.
- **Error ambiguo después de intentar commit Mongo** (p.ej. corte de red durante confirmación): no se borra S3. La transacción podría haberse confirmado y el trabajo completado necesitar el objeto. `reschedule` está protegido por CAS; si el trabajo ya terminó no se modifica. Si el objeto quedó huérfano, la política de retención del bucket privado continúa siendo el backstop, pendiente de reconciliación operativa exact-head.

No se publican ni retornan credenciales de S3, tokens, datos de otros usuarios o el contador de autoridad en el JSON exportado.

## Evidencia incorporada

- Jest unitarios del Store Mongo: cierre transaccional v3, epoch obsoleto, owner legacy 0, claim vencido con rollback, intento v3 sin authority.
- Jest del servicio: requerimiento obligatorio de `ownerUserId` y `expectedProgressEpoch` sólo para v3.
- Jest del worker: orden S3→epoch→Mongo, rechazo y limpieza de S3, error de lectura del epoch, reintentos y agotamiento, resultado ambiguo de commit sin borrado, aislamiento v1/v2.
- Mongo replica set local **opt-in**: validación transaccional real del fence, progreso actualizado entre lectura y completado, rollback por claim vencido.
- `scripts/test-account-export-b65-atomic-completion.mjs` incluido en `pnpm test:account-lifecycle-contract` con inspección de invariantes de código y fail-closed.

## Límites de validación

Los tests están **implementados**, pero no significa que hayan corrido. El entorno de herramientas de este carril tiene Node 22 sin checkout completo y no puede resolver github.com desde shell. Se revisó código vía conector GitHub; quedan pendientes, sobre el SHA exacto: `pnpm install --frozen-lockfile` (el monorepo exige Node 24), TypeScript, Jest, prettier/eslint, Mongo replica set, S3/HTTP E2E, lease race, backup/restore y aceptación de producto.

La feature `STUDY_PROGRESS_ENABLED` sigue desactivada por defecto y `validateRuntimeEnvironment` prohíbe habilitarla en producción. No se ejecutó CI manualmente ni se alteraron excepciones de seguridad (#133/#141).

## Conciliación en PR paralelos

#349 modifica fuentes de `data-lifecycle`: preservar los métodos B63/B64, el nuevo fence transaccional y clasificación de errores. #331 trabaja con tests v1: no reintroducir fallos en los manifests 30/31/32 o en las pruebas de worker v3. El bloque no modifica front, auth, permisos, pagos ni datos de producción.
