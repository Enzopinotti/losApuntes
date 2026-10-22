# B68 — Fence de concurrencia y autoridad para limpieza de exportaciones privadas

**Baseline:** `main@77b2158ad9dada524c46d5f1f9bb4aa0b25ffc19` (B67). **Estado:** implementación y pruebas añadidas; release gate #353 abierto, producción bloqueada.

## Problemas identificados al auditar B67

1. El limpiador buscaba `AccountExportStore.findOwned(jobId, ownerUserId)`. Ese método retorna `null` si el dueño almacenado en la fila de la cola es incorrecto, **aunque exista un trabajo completado de otro usuario** con ese ID. Una fila inconsistente podía interpretarse como ausencia del job y autorizar un borrado indebido. Las filas de la cola son internas, pero también se deben proteger contra corrupción, migraciones incompletas y errores de backfill.
2. El lease de la tarea de limpieza era renovable sólo por reclamación, pero B67 no lo actualizaba durante una llamada de S3 lenta. Otro worker podía reclamarla al vencer el plazo mientras el primero seguía borrando, provocando ACK perdido, ejecución duplicada y diagnóstico confuso.
3. Una lectura Mongo de autoridad podía agotar el lease inicial. Sin otro chequeo, el worker podía empezar una eliminación después de haber perdido la titularidad del trabajo de limpieza.

## Implementación

- **Autoridad independiente del dueño provisto por la cola.** Nuevo método interno `AccountExportStore.findForOrphanCleanup(id)`, con implementación Mongo por `findOne({id})`. A diferencia de `findOwned`, permite detectar si el propietario durable difiere de `candidate.ownerUserId`. El worker **falla cerrado** y reintenta sin llamar a S3 si `id` o `userId` no concuerdan.
- **Renovación fenced y monótona.** `AccountExportOrphanCleanupStore.renewLease` efectúa `updateOne` CAS sobre `(jobId,generation,state='processing',claimId,leaseExpiresAt > now)` con `$max` de nuevo vencimiento. La operación no reanima un claim vencido ni acorta el lease.
- **Control pre-S3.** Después de consultar la autoridad y antes de enviar la solicitud DELETE, el worker exige renovar exitosamente el claim. Si la tarea fue robada o expiró, registra `orphanRetries` y no llama a S3.
- **Heartbeat durante el DELETE.** Un intervalo de un tercio del lease renueva mientras S3 procesa el borrado. No se solapan renovaciones; se espera la última al terminar. Si la renovación falla o se pierde el claim, el worker **no reconoce** la tarea, aunque S3 ya haya respondido: deja su reconciliación al nuevo claim.
- **ACK exacto.** Sólo se reconoce una tarea usando `jobId + generation + claimId` y lease vigente. La eliminación física queda acotada a `exports/{jobId}/{generation}.json`, nunca a prefijos completos.
- **Compatibilidad:** sin migración de datos de exportación; formato v1 30 secciones, v2 31, v3 32 intactos. Sin permisos ni nuevos endpoints. Se conserva la regla B66 de no eliminar ante resultado incierto del commit Mongo.

## Matriz de aceptación añadida

- Jest Mongo store: lectura durable por ID **sin filtrar propietario**; renovación por CAS `$max`, con éxito y claim perdido.
- Jest worker: dueño inconsistente → ningún DELETE, lookup lento y renovación fallida → ningún DELETE, orden renovación→S3→ACK, DELETE lento → heartbeat adicional, pérdida de lease durante DELETE → sin ACK ni reintento sobre claim ajeno.
- Mongo opt-in con replica set verificado y base temporal: dos almacenes compiten concurrentemente por la misma tarea; sólo uno la adquiere, renueva y reconoce. Un owner equivocado en una fila de la cola **no** puede borrar la generación referenciada por el dueño verdadero.
- `scripts/test-account-export-b68-concurrency.mjs` agregado a `pnpm test:account-lifecycle-contract`. También se actualizó el guard B67 para validar `findForOrphanCleanup` y `renewLease` sin generar falsos negativos de los contratos previos.

### Limitación de concurrencia restante

La renovación periódica **no es una transacción distribuida con S3**. Si una operación de borrado ya fue aceptada por S3 y el lease se pierde durante la llamada, otro worker podría intentar borrar el mismo objeto; el objeto está identificado por una generación conocida y el borrado debe ser idempotente. El worker anterior no puede hacer ACK sin lease. Las tareas encoladas siguen requiriendo la prueba previa de orfandad de B65–B67. No se debe usar la cola como mecanismo de borrado genérico de archivos privados ni afirmar semántica exactly-once a través de Mongo+S3.

## Estado real de validación

Los tests quedaron **escritos y conectados**. En esta pasada se inspeccionó código de GitHub y se verificó la estructura; no se ejecutaron Jest, TypeScript global, prettier/eslint, Mongo replica set, S3 real, HTTP ni CI manual. La feature Study Progress continúa deshabilitada y prohibida en producción. Mantener issue #353 abierta hasta aceptación end-to-end del SHA exacto, revisión S3 versionado/retención y backups.

**Carriles paralelos:** #349 toca formato de API y debe preservar el nuevo método interno de autoridad, el heartbeat y la suite B68; #331 toca tests de exportaciones legacy y debe mantener los manifests y fixtures correspondientes.
