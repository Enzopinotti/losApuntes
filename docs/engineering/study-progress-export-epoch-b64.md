# B64 — Owner epoch fence for Study Progress export v3

**Clase de cambio:** corrección de consistencia ya esperada por los contratos de privacidad y portabilidad (`NFR-SEC-001`, `NFR-PRIV-001`, `NFR-REL-001`, `PLAT-FR-006/007`). No agrega endpoints públicos, persistencia nueva, flags ni datos exportados.

**Baseline de partida:** `main@e555a5d957f54fdc82392a30695b2308d8ac78c5` (B63).

## Riesgo resuelto

Hasta B63 la selección de Account Export v3 se revalidaba al solicitar el trabajo. Una vez que el worker empezaba a generar el archivo, un estudiante podía **crear, actualizar o borrar** un progreso privado y el assembler podría entregar una combinación de filas de momentos distintos sin advertirlo.

El repositorio ya dispone de un contador `User.account_lifecycle_revision` (select:false), incrementado **dentro de la misma transacción Mongo** por `StudyProgressService.save/remove`; el cierre de cuenta comparte el mismo write fence. B64 aprovecha ese contador como señal *monótona por propietario*, sin leer planes privados para verificar consistencia.

## Implementación

1. `UsersService.getStudyProgressExportEpoch(userId)`: lectura acotada por `_id` y estado activo; selecciona exclusivamente `account_lifecycle_revision` de manera explícita, no lo añade al payload de exportación. Un registro histórico sin campo tiene epoch 0. Cuentas inactivas, errores de Mongo o epoch malformado fallan cerrado.
2. `AccountExportService.captureStudyProgressExportEpoch` y `assertStudyProgressExportEpoch`: exponen el control **solo al assembler servidor**, comparan enteros seguros y generan una falla reintentable cuando el epoch cambió.
3. `AccountExportAssembler.writeJsonV3`: lee el epoch antes de la primera escritura del stream y lo vuelve a consultar justo antes de `sink.commit`, después del chequeo de cuenta activa y del claim. Si cambió, aborta el staging. No se genera metadata completada ni archivo descargable.
4. El worker conserva su tratamiento de falla `EXPORT_ASSEMBLY_RETRY` con backoff y máximo 5 intentos. Si la cuenta sigue modificándose, el proceso termina como `EXPORT_RETRY_EXHAUSTED` **sin presentar una exportación inconsistente como exitosa**.
5. Los trabajos históricos v1/v2 se ejecutan sin esta nueva lectura ni cambios en sus 30/31 secciones. El manifiesto v3 permanece en 32 secciones.

## Alcance preciso de consistencia

La garantía es **optimista, por owner, desde inicio de ensamblado v3 hasta el chequeo inmediatamente anterior a publicación**. Detecta cambios de progreso realizados a través del servicio transaccional del backend; también puede abortar conservadoramente ante otros incrementos del contador del mismo usuario.

No es una snapshot Mongo **global** del conjunto de 32 secciones. No evita que cambien recursos o datos de otros módulos que no incrementan el mismo contador; tampoco cierra matemáticamente la ventana entre el último chequeo y la terminación de `sink.commit`, ni detecta escrituras fuera del servicio autorizado que omitan el fence. No presentar B64 como un snapshot transaccional o como aislamiento serializable de toda la exportación.

Una garantía más fuerte necesita coordinación transaccional de lectura/versión final y publicación de artefacto (o captura de snapshot durable acotada) y evidencia sobre esos límites, sin mantener una transacción Mongo abierta durante una transferencia S3 arbitrariamente larga.

## Evidencia incorporada

- Unit de UsersService: lectura active-owner selectiva, registros legacy, epoch corrupto, cuenta inactiva.
- Unit de AccountExportService: misma revisión, revisión distinta y pérdida de Mongo.
- Unit del assembler v3: revisión estable → commit; cambio → abort sin commit; v1/v2 sin efecto.
- Unit del worker: retry `EXPORT_ASSEMBLY_RETRY` ante cambio y finalización controlada al agotar intentos.
- Test Mongo opt-in: un `StudyProgressService.save` **real**, activado durante el stream, incrementa el epoch del usuario; el ensamblado v3 falla y no confirma.
- `scripts/test-account-export-b64-epoch-fence.mjs` incorporado a `pnpm test:account-lifecycle-contract`, para detectar pérdida accidental del control prepublicación.

**QA pendiente:** typecheck/Jest/format/lint en checkout completo, Mongo replica set real, pruebas del worker/S3 y browser/API, backup/restore, auditoría de dependencias y consistencia temporal global exact-head. La ausencia de esas ejecuciones impide afirmar aptitud productiva.

## Release y coordinación

`STUDY_PROGRESS_ENABLED` permanece **apagado por defecto y prohibido en producción** por `validateRuntimeEnvironment`. La issue #353 sigue abierta. No se alteraron excepciones #133/#141 ni se ejecutó CI manualmente.

El PR paralelo #349 toca `account-export.service.ts` y el #331 toca tests del assembler; se deben rebasar para preservar el doble chequeo B63 y el nuevo fence B64.
