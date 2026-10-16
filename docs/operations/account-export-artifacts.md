# Account export artifact bucket operations

**Parent:** #183 (AUTH-FR-012)

**Policy source:** [`infra/storage/account-export-lifecycle.json`](../../infra/storage/account-export-lifecycle.json)

**Runtime access policy example:** [`infra/storage/account-export-runtime-policy.template.json`](../../infra/storage/account-export-runtime-policy.template.json)

**Security contract:** [`account-data-export-v1.md`](../security/account-data-export-v1.md)

## Required bucket boundary

Use the dedicated private account-export bucket configured by
`ACCOUNT_EXPORT_S3_BUCKET`. It must be separate from the Files bucket and use
export-scoped production credentials. The API must reach it through the
private endpoint; browser and mobile clients never receive bucket credentials,
object keys or signed URLs.

The object prefix is `exports/`. The application denies downloads exactly
seven days after `completedAt`; status checks and downloads do not extend that
window. The lifecycle configuration below is recovery cleanup for abandoned multipart
uploads and orphaned completed objects. It does not define the API's download
cutoff.

## Runtime credential scope

The API/worker identity and the operator identity are separate. The runtime
identity needs object access only for `exports/*` in the dedicated bucket. The
AWS IAM template grants exactly the adapter's current operations:

- `s3:PutObject` to write and complete single-part/multipart artifacts;
- `s3:AbortMultipartUpload` to cancel incomplete multipart writes;
- `s3:GetObject` to stream a completed artifact through the API;
- `s3:DeleteObject` to remove an expired artifact or failed staging object.

AWS maps multipart creation, part upload and completion to `s3:PutObject`, and
abort to `s3:AbortMultipartUpload`. The policy resource is an object ARN scoped
to the `exports/` prefix. [AWS multipart permissions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html), [AWS object-resource scoping](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security_iam_service-with-iam.html)

It grants no bucket listing, Files access, ACL changes, bucket policy changes,
or lifecycle administration. Replace
`REPLACE_WITH_ACCOUNT_EXPORT_BUCKET` with the dedicated bucket name before
using the template with AWS IAM. For another S3-compatible provider, translate
the four object operations and the `exports/*` resource into its native policy
format, then verify that the runtime identity cannot list the bucket, access
Files, or change bucket configuration. Provider API compatibility does not by
itself prove policy-language compatibility.

Attach no broader role, group, or inherited grants to the runtime identity.
Provisioning and lifecycle changes use a separate administrative identity.
Keep the bucket private with public access disabled; this runtime policy does
not configure bucket privacy. The static contract checks the example's exact
action allowlist and object prefix, but does not prove provider policy state.

## Lifecycle policy

The checked-in lifecycle JSON is a complete two-rule configuration for the
dedicated export bucket:

1. Abort incomplete multipart uploads under `exports/` after seven days from
   initiation.
2. Expire objects under `exports/` after eight days from object creation.

On Amazon S3, lifecycle expiration is queued asynchronously after the object
reaches the configured age; the age is evaluated on a UTC day boundary. The
eight-day rule is therefore an eligibility/backstop window, not an exact
physical-deletion timestamp. S3-compatible providers may differ; confirm their
documented semantics and verify the applied rule on each provider before
enabling production delivery. [AWS lifecycle timing](https://docs.aws.amazon.com/AmazonS3/latest/userguide/troubleshoot-lifecycle.html)

If the bucket already has lifecycle rules, merge these two rules with the
existing configuration before applying. `PutBucketLifecycleConfiguration`
replaces the bucket's current lifecycle configuration. [AWS CLI operation](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-bucket-lifecycle-configuration.html)

## Apply and verify

Do this through the provider's approved change process, using an administrative
profile scoped to the dedicated export bucket. The administrative profile is
not the API/worker runtime identity. Supply the private endpoint and bucket
explicitly; do not put credentials in command arguments or logs.

```sh
aws --profile account-export-admin s3api put-bucket-lifecycle-configuration \
  --endpoint-url "$FILES_S3_ENDPOINT" \
  --bucket "$ACCOUNT_EXPORT_S3_BUCKET" \
  --lifecycle-configuration file://infra/storage/account-export-lifecycle.json

aws --profile account-export-admin s3api get-bucket-lifecycle-configuration \
  --endpoint-url "$FILES_S3_ENDPOINT" \
  --bucket "$ACCOUNT_EXPORT_S3_BUCKET"
```

Review the readback and confirm both enabled rule IDs, the `exports/` prefix,
`DaysAfterInitiation: 7` and `Expiration.Days: 8`. Also record the provider,
bucket, endpoint identity, change reference, readback time and operator in the
deployment evidence. A successful local contract test only validates the
checked-in policy; it is not evidence that any remote provider is configured.

## Local runtime smoke

`scripts/smoke-account-export-lifecycle.mjs` runs after the synthetic Auth and
domain smokes. It authenticates the existing runtime fixture, requests an
export, waits for the separate worker to complete it, and downloads the JSON
through the owner-authorized API from the local private RustFS bucket. The
probe checks the v1 envelope, all 30 array-valued sections, bounded streaming
response, download headers, expiry window and absence of credential/storage
fields. Request and status metadata must match the public `AccountExportStatus`
allowlist, stable job states and failure codes; persistence and artifact
generation fields must not escape the API. Missing-session request, status and
download probes must return `AUTHENTICATION_REQUIRED` before exposing export
metadata or bytes. Its 32 MiB cap applies only to the small synthetic smoke
fixture.

If a download response closes before it finishes, the API aborts the private S3
GET and cancels any pending body read. A normal completed response does not
cancel the provider stream early; the existing S3 request timeout remains at
30 seconds.

Container runtime smoke therefore covers the local Mongo/worker/object-store
path end to end. It does not verify production-provider IAM, lifecycle
readback, private-access configuration or physical deletion.

## Artifact metadata and streamed read integrity

**Format v1 has exactly 30 named sections.** The Nest contributor factory
fails during module setup if the inventory drifts, and
`AccountExportService.complete` rejects completed jobs whose assembly
metadata reports any other section count. The owner-visible status does
not advertise an artifact as downloadable unless the stored record has
the correct format version, 30 sections, positive safe-integer byte length,
non-expired generation and a lowercase SHA-256 digest.

On every authorized GET, the controller receives that persisted digest only
from the owner-fenced service. The private object stream is bounded to the
committed byte length **before forwarding an oversized chunk**. At end of
stream it checks that both the byte length and SHA-256 match the metadata.
Truncation, oversized objects, binary-type errors, client cancellation and
digest mismatch fail the stream. A provider read failure retains its original
error for server handling; clients must treat a failed/incomplete response as
unusable.

**Important limitation:** an end-of-stream digest check cannot retract
bytes already transmitted, and an HTTP content-length may be satisfied before
a late streaming error is observed by some clients. This mechanism is a
defense in depth, **not a pre-delivery verified download** or a guarantee
against provider tampering. A production trust decision requires private
bucket/IAM review, provider readback of SHA-256, client-side checksum support
if strict end-to-end integrity is required, and fault-injection tests in the
actual HTTP runtime.

New regression specifications exist in
`storage/account-export-download-integrity.spec.ts`,
`domain/account-export.service.spec.ts` and
`account-export.controller.spec.ts`.
They are written but were **not executed** in this accelerated block.

## Lost-lease completed artifacts

Every retry writes to a different private attempt generation
(`exports/{jobId}/{claimId}.json`). The assembler commits bytes before
the job store publishes its completed metadata, fenced by the active lease.
If renewal reports that a lease was lost after the attempt object was
committed, the worker now **explicitly deletes that exact attempt object**
rather than calling multipart abort on an already-completed upload.
It must not delete another claim's generation or treat an unowned
attempt as successfully completed.

An object-store outage during this best-effort deletion cannot be
resolved by Mongo claim CAS because the old worker no longer owns the
job. The worker reports the claim as stale; the isolated export bucket's
`exports/` lifecycle rule provides eventual cleanup of an orphaned
object. That backstop is **not** proof of immediate physical deletion:
verify the provider's lifecycle, object versioning, replicas and
noncurrent-version retention before production use.

Regression specifications for both the successful removal and temporary
delete failure are in
`apps/api/src/data-lifecycle/domain/account-export-processor.spec.ts`.
They are written but **not executed** in the accelerated development
lane.

## Retention limits

Lifecycle processing can be delayed. In a versioned bucket, expiring the
current version may add a delete marker while noncurrent object versions
remain; versioning and noncurrent-version expiration require a separate
retention decision. [AWS object expiration and versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html)

The seven-day API window and eight-day lifecycle policy do not promise deletion
from version history, backups, replicas, recovery media or provider billing
records. Do not describe them as a legal retention or backup-purge guarantee.


## B66 — Reconciling an uncertain durable completion

When the worker receives an error after a private export generation was
uploaded to S3, it must **not** assume that the database commit failed. A lost
Mongo acknowledgment can occur after the transaction has committed.

The worker first looks up the export via the exact owner and job ID. It can
recognize completion only when the durable row is marked completed/inactive
and its **attempt generation, format version, section and record counts, byte
length, and SHA-256** all match the uploaded artifact. In that case it reports
completion; it never deletes the referenced object or requeues the job.

If the record does not prove completion, the worker tries to release or fail
the **original claim using Mongo CAS**. Successful CAS is proof that that
claim did not publish a completed job. Only after success may the worker
delete `exports/{jobId}/{claimId}.json` as an orphan. If the CAS loses,
the worker checks durable completion a second time. Without exact proof it
returns stale and preserves the object. Failed lookup or CAS reads are not
permission to delete. The bucket lifecycle remains the fallback when an
orphan cleanup fails.

**Operational triage, without leaking identifiers into public logs:** Inspect
the job's `state`, `active`, owner, generation, and checksum using an
authorized internal Mongo session; compare only the attempt-scoped S3
generation. Never delete on an error message alone, never delete another
claim's generation, and never log artifact content, tokens, object URLs, or
the owner's private plan. Alert on repeated worker
`iteration_failed` events, retry exhaustion, and provider lifecycle drift.
Validate exact-head recovery via fault injection and the Mongo opt-in B66
tests before production.

See `docs/engineering/account-export-reconciliation-b66.md` for the proof
model, failure matrix, and remaining acceptance requirements.


## B67 — Durable orphan cleanup queue

If deletion of a **proven orphaned** generation fails, the export worker
persists an idempotent task in the private Mongo collection
`account_export_orphan_cleanup`, uniquely keyed by the exact job and
generation. A new worker can recover the task after process restart or
lease expiry. No user-facing API exposes that queue.

Each iteration drains at most ten due tasks, verifying the job's recorded
owner, status, active lease and referenced artifact generation **before**
attempting to remove `exports/{jobId}/{generation}.json`. A completed job
that still references that generation is preserved. A live matching claim is
deferred. Only the exact attempt generation may be deleted, never an entire
prefix. A successful delete is followed by claim-fenced queue ACK; storage
errors get a bounded-backoff durable retry with no automatic attempt cap.

The worker's structured iteration output reports `orphanDeleted`,
`orphanPreserved` and `orphanRetries`. Monitor persistent nonzero retries,
the Mongo queue age and S3 lifecycle behavior. Counters do not identify a
user or include private payload content.

This system handles **known** failed deletions; it does not crawl S3 for
objects created before queue deployment. If both Mongo and S3 fail during
enqueuing, lifecycle expiry remains the fallback. Actual physical deletion
may be delayed by provider retention, version history and replicas: audit
the bucket policy separately before lifting the production release hold.

See `docs/engineering/account-export-orphan-cleanup-b67.md` for
constraints and the opt-in replica-set acceptance suite.


## B69 — Write-ahead cleanup intent before S3

Whenever a proven orphan generation needs cleanup, the worker now persists
a private Mongo intent **before** attempting its S3 DELETE. On success, it
clears the intent only if it remains unclaimed (`pending`, `claimId=null`);
a task already held by a second worker is not cancelled. On S3 failure or
process crash, the durable intent remains eligible for the lease/retry
mechanism. If Mongo cannot enqueue, the worker still performs a best-effort
DELETE; private bucket lifecycle remains the fallback if both systems fail.

This closes the loss-of-work window between a failed DELETE and recording
a retry. It does **not** provide distributed transactional deletion or
enumerate untracked legacy objects. An uncertain Mongo completion must still
be reconciled before establishing any deletion intent.

The B69 repair also restores the Jest spec nesting and timer cleanup for the
earlier B67/B68 worker tests. Production qualification still requires
an exact-head Jest/Mongo/S3 fault-injection pass.

## B68 — Orphan cleanup workers, lease renewal and owner authority

The private orphan queue is not a permission to delete a generation. The
cleanup worker first looks up the **actual durable job by job ID**, then
compares its stored owner with the queued owner. A mismatch always fails
closed and schedules a retry; do not treat a missing owner-scoped lookup as
proof that an object is unreferenced.

After checking that the generation is not referenced by a completed job
and not held by a live matching export claim, cleanup renews its own
queue lease using a claim-fenced, monotonic update. If renewal fails, no
S3 DELETE is initiated. During a long S3 deletion, a heartbeat continues
renewing the cleanup lease. If the claim is lost or the queue lease expires,
the old worker must not acknowledge the task. A newer worker can reclaim
it after expiry and retry the exact generation idempotently.

Operational verification: use the B68 opt-in Mongo replica-set tests to
exercise two concurrent workers and a mismatched owner. Monitor
`orphanRetries` and queue age for recurring lease loss. A successful
S3 DELETE does not prove provider-wide deletion of retained noncurrent
object versions, replicas, backups or archival copies; investigate
bucket versioning and lifecycle policies separately.

See `docs/engineering/account-export-orphan-concurrency-b68.md`.


## B70 — Fail-closed cleanup authority and local acceptance

An orphan queue record must **never** be treated as proof that the
corresponding account-export job is absent. B70 forbids private S3 DELETE
when the authoritative Mongo job lookup returns no row, or when its real
job ID/owner disagrees with the queued entry. The task remains durable,
retries through its existing lease/backoff, and contributes to
`orphanAuthorityBlocked`. Investigate such repeated blocks as potential
corruption, accidental job deletion, or a misplaced cleanup task; do not
resolve them by blindly deleting S3 keys.

Any job whose `artifactGeneration` still points at the candidate generation
is protected, even if the job's state is not `completed`. This is a
fail-closed response to inconsistent data, rather than evidence that a
partially completed export may be downloaded. There is no new public API.

For a clean local checkout at an exact merge SHA and an isolated,
uncredentialed Mongo replica set, use the B70 acceptance runner:

```bash
export STUDY_PROGRESS_TEST_MONGO_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0'
pnpm accept:account-export:b70 --expected-sha <40-character-commit-SHA>
```

The runner refuses wrong Node/pnpm versions, a dirty or mismatched checkout
and nonlocal MongoDB. It records a credential-free JSON summary in the
system temporary directory. It does **not** execute actual S3-provider
acceptance or HTTP/browser tests and cannot approve a production release.
Keep release issue #353 open until all external acceptance and retention
controls have been proven. See
`docs/engineering/account-export-authority-b70.md`.


## B71 — Ambiguous S3 multipart completion and safe retry-CAS cleanup

A failed or timed-out S3 multipart `complete()` response is **not**
proof that no final object was published. An abort request may abort only
an in-progress multipart upload, not delete a final committed object.

B71 ensures that once the exact original account-export claim has
**successfully transitioned through the durable Mongo `reschedule` CAS**
to `pending` or `failed`, its UUID-qualified S3 generation is treated
as a proven orphan even when the assembler never returned success.
The worker first persists the B69 cleanup intent, then attempts exact
S3 object deletion. If deletion fails, another worker can claim/retry
the durable task after restart.

If the retry CAS is rejected or unavailable, preserve the S3 generation:
an uncertain Mongo completion might already reference it. Never
assume that an S3 abort proves absence, and never delete an entire
object-key prefix.

The local exact-head acceptance runner now includes S3 storage and
export assembler Jest files, while real S3/HTTP/provider E2E remain
independent gates. See
`docs/engineering/account-export-ambiguous-s3-b71.md`.


## B72 — Transactional retirement of expired account export artifacts

**Never delete the S3 artifact before unlinking the expired download
reference.** B72 replaces the old S3-first `clearExpiredArtifact` path with
`retireExpiredArtifact`. The Mongo store uses a single transaction for
a compare-and-set on `id + completed state + exact generation + exact due
expiry` and a write-ahead cleanup intent scoped to the **durable owner**
of the previous row. If the CAS loses or queue creation fails, the S3
object is untouched and any Mongo unlink is rolled back.

After retirement, the existing private orphan worker enforces owner and
lease checks and deletes the exact `exports/{jobId}/{generation}.json`
object. On transient provider failure or worker restart, the Mongo queue
persists and the next worker may safely retry. The bucket lifecycle rule
remains an independent backstop for missed historical objects and retained
noncurrent versions.

Operational counters: `expiredRetired` = transactional unlink and durable
queue success; `expirationStale` = expired-row CAS changed or became
ineligible; `expirationRetries` = Mongo sweep/transaction errors;
`orphanDeleted` = actual S3 deletion. The old `expiredDeleted` output
is retained only for legacy log readers and **is not a physical deletion
counter** after B72.

A Mongo failure during expiration must not block new export claims.
Repeated `expirationRetries` or growing orphan queue age warrant
investigation. Production remains HOLD (#353) until the exact-head local
replica-set suite, S3 provider tests, HTTP download/privacy, retention
policies and backups all pass.

See `docs/engineering/account-export-atomic-expiry-b72.md`.


## B74 — Expired export claim takeover and abandoned multipart generation

When a worker takes over an **expired processing** claim, the Mongo store
now performs the takeover and records cleanup for the previous attempt's
UUID generation in the **same Mongo replica-set transaction**. The new
worker is only handed the new claim after Mongo verifies its owner and
claim ID. On transaction failure, including failure to enqueue the old
generation, the takeover rolls back and cannot silently discard the old
S3 object key. Ordinary pending jobs do not create orphan rows.

Cleanup of a reclaimed previous generation starts no earlier than three
export lease periods after the takeover. This gives an older multipart
operation a settling window, but does NOT guarantee that an indefinitely
delayed S3 completion can never race after cleanup ACK. Enforce bucket
lifecycle retention, instrument long multipart durations and perform
periodic object inventory/audit separately before production signoff.

Run the opt-in Mongo replica-set B74 tests for takeover, queue rollback
and exact-generation cleanup, and keep #353 OPEN until Node/Jest/Mongo,
S3 multipart fault-injection, HTTP download/privacy and retention
signoffs are complete.

See `docs/engineering/account-export-takeover-ledger-b74.md`.


## B75 — Repeated cleanup checks for late multipart commits

A recovered processing claim now leaves an orphan cleanup row with a
`verificationUntil` horizon of one hour after takeover, in addition
to the initial three-lease settling delay from B74. After successful
exact-key DELETE, the queue stays durable and is scheduled again within
ten minutes until the final verification pass. Each attempt rechecks
the real owner, durable artifact references and its queue lease.

A fast-path `clearPending` cannot remove a takeover row. A claimant
that obtained the row before a concurrent takeover extended the horizon
also cannot ACK it: both the claim and exact verification deadline must
match. Existing queue rows receive monotonic deadline extensions within
the takeover transaction.

`orphanVerificationScheduled` counts successfully scheduled rechecks.
`orphanDeleted` counts final acknowledged deletion only;
`orphanRetries` captures outages or lost claims.

This is a bounded mitigation. A provider may complete a multipart upload
after the one-hour period; incomplete-multipart expiration policies,
provider fault-injection, inventory/version audits and retention/backup
signoff are still required. Keep issue #353 open and production disabled.
See `docs/engineering/account-export-late-multipart-b75.md`.


## B77 — Due-date fence when reclaiming abandoned cleanup leases

The B75 `verificationUntil` horizon is now a CAS fence for **lease
renewal and retry**, not only ACK. A worker that claimed the queue row
before a concurrent takeover extended its deadline cannot shorten the
settling period or keep renewing its stale horizon. A retry uses
`$max(nextAttemptAt)` rather than resetting the due date.

A recovery of an expired `processing` queue claim must satisfy **both**
`leaseExpiresAt <= now` and `nextAttemptAt <= now`. On account-export
takeover, the exact previous generation's due date is extended
monotonically in the same Mongo transaction even if another cleanup
worker already claimed its task; the claimant's ID and lease are not
stolen. This prevents the next worker from deleting S3 in the original
B74 three-lease settling window merely because a cleanup lease expired.

Check `orphanRetries` and `orphanVerificationScheduled` for repeated
lost-fence outcomes. Use local opt-in replica-set tests with stale
claimants to verify this handoff before production signoff. The B75
one-hour upper verification horizon still requires S3 provider
fault-injection, multipart lifecycle expiry, object/version inventory,
and backup/retention acceptance. See
`docs/engineering/account-export-settlement-fences-b77.md`.
Production gate #353 remains OPEN.


## B78 — Queue-only cleanup on failed export attempts

The export worker no longer executes an immediate S3 DELETE after a
confirmed stale claim or retry-CAS. It **only writes the durable orphan
intent**. The separate drainer, on a subsequent iteration, verifies the
real job owner, exact generation, active lease, takeover due date and
verification horizon before deleting. A stale worker cannot bypass the
three-lease settling delay by re-enqueuing an existing takeover task.

If orphan enqueue fails, the worker does not attempt a direct S3 delete;
operators must investigate queue persistence and provider lifecycle. This
is not proof of storage/backup erasure. Run the B78 source guard and
exact-head Jest/Mongo/S3 acceptance before removing release HOLD #353.

## B79 — Recuperación acotada de encolado y alerta sin secretos

El intento de exportación que ya demostró que una generación no se puede
publicar intenta persistir su limpieza **hasta tres veces** (esperas de
50 ms y 100 ms tras errores). Esto no cambia el plazo de verificación ni
los leases existentes, porque el encolado Mongo es idempotente.

La iteración del worker añade tres contadores internos:
`orphanEnqueueRetries` (intentos adicionales), `orphanEnqueueRecovered`
(encolados que finalmente se guardaron) y `orphanEnqueueFailures`
(generaciones sin intención durable tras agotar los intentos). Si el último
contador es mayor que cero, el worker emite un evento WARN
`account_export.worker.orphan_enqueue_failed` con `failedCount`
y `retryCount`. **No hay IDs de usuarios, jobs, generaciones, tokens,
nombres de archivos ni mensajes del proveedor.**

Al recibir esta alerta, investigar de manera autorizada el estado de Mongo
y la cola, revisar el inventario del bucket S3 y el lifecycle remoto; una
falla de encolado definitivamente no demuestra que exista una tarea durable.
No borrar objetos por cuenta propia basándose solo en ese contador.
Mantener `STUDY_PROGRESS_ENABLED` inactivo en producción y issue #353 HOLD.

Pruebas locales sin dependencias externas:
`node --experimental-strip-types --test scripts/test-account-export-b79-enqueue.test.mjs`;
el contrato de integración está en
`node scripts/test-account-export-b79-observability.mjs`.
Ni una prueba unitaria de Node ni un contrato estructural acreditan
Mongo replica-set, permisos de S3, lifecycle de versiones, backups o
aceptación de dispositivos.

## B80 — Intento de recuperación transaccional desde el primer claim

En cada claim de exportación el worker ahora exige un registro durable de
limpieza de **su nueva generación**, persistido en la misma transacción Mongo
que cambia el job a `processing`. Esto aplica tanto a jobs `pending` como a
takeovers. **Si falla el insert de la cola, se aborta toda la transacción y
no se inicia la escritura en S3**. Es una protección contra caídas de proceso
o períodos largos de Mongo inestable luego de comenzado el upload.

Cada tarea se programa desde el vencimiento del lease original con tres
leases más de asentamiento y luego verifica la eliminación por una hora
adicional. La cola es una *intención*, no un permiso de DELETE: el worker
de limpieza vuelve a leer owner, referencia publicada, claim vigente,
due date, claim lease y horizonte CAS. Un export completado conserva su
archivo y ACKea la intención sin tocar S3. B79 mantiene reintentos
idempotentes y alertas si el callback tardío no pudo reencolar.

Para diagnosticar un caso tras un restart, verificar por canales
administrativos autorizados la presencia de un documento en
`account_export_orphan_cleanup` asociado a `jobId`/`generation` sin
exponerlos en logs. Comprobar `nextAttemptAt`, `verificationUntil`,
`state`, `claimId`, `leaseExpiresAt` y el estado del job de exportación.
No acortar vencimientos ni ejecutar DELETE manualmente para acelerar
una recuperación.

La mejora cubre **claims creados por código B80**; no retroinventa
filas para generaciones creadas antes del despliegue. Mantener
`STUDY_PROGRESS_ENABLED=false`, issue #353 HOLD y controles de
backup/retención versionada, lifecycle y auditoría de credenciales.
Pruebas: `node --experimental-strip-types --test
scripts/test-account-export-b80-writeahead.test.mjs` y
`node scripts/test-account-export-b80-writeahead.mjs`,
más opt-in Mongo replica-set. Sin aceptación real S3/Mongo no hay
habilitación productiva.

## B81 — Cancelación de multipart sin DELETE implícito en exportaciones

La ruta de error `AccountExportProcessor → sink.abort() → S3 writer.abort()`
podía ejecutar un `DELETE` no autorizado del objeto completo, incluso
cuando S3 hubiera confirmado internamente un PUT/multipart y solo se
hubiera perdido el ACK. Este borrado evadía el ledger transaccional B80
y las barreras de fecha, lease y propietario B78/B77.

**Desde B81:** el escritor S3 recibe `deleteObjectOnAbort: false`
exclusivamente desde `S3AccountExportArtifactStorage`. Al cancelar:

- Con multipart incompleto, se solicita **AbortMultipartUpload por uploadId**,
  pero no un `DELETE Object` del archivo.
- Con PUT simple o completion ambiguo, el archivo potencialmente creado
  **queda para la cola durable**, que comprobará la autoridad antes de borrarlo.
- Los consumidores genéricos siguen usando la semántica previa por defecto
  (`deleteObjectOnAbort` omitido o `true`), para no romper flujos ajenos.
- La operación explícita `deleteArtifact` sigue disponible solo tras las
  verificaciones del procesador; cancelar un upload **no acredita** ausencia
  del objeto.

Diagnóstico: ante una respuesta de S3 perdida, no reintentar un DELETE
directo. Revisar la intención durable `account_export_orphan_cleanup`,
`nextAttemptAt`, `verificationUntil`, estado actual del job, claim y
lease; esperar el worker de compensación o seguir procedimiento autorizado
de inventario/lifecycle. La falta de objeto después de `abort` tampoco
demuestra que no pueda aparecer un multipart finalizado tardíamente.

Regresión ejecutable sin servicios: `node --experimental-strip-types --test
scripts/test-account-export-b81-s3-abort.test.mjs` y
`node scripts/test-account-export-b81-abort-guard.mjs`. Estos tests
mockean HTTP; **no reemplazan la aceptación contra S3 real**. #353 HOLD,
`STUDY_PROGRESS_ENABLED=false`, verificación de permisos, versionado,
backups y retención aún obligatoria.

## B82 — Revocación atómica del claim vencido antes de S3 DELETE

El chequeo previo de lease vencido del drainer no alcanzaba para bloquear
un `complete()` que ya había comenzado y conservaba un `completedAt`
anterior al vencimiento. El resultado posible era un job `completed`
publicado en Mongo luego del `DELETE` de su archivo.

B82 exige un **CAS de escritura en el documento del job** antes de
eliminar una generación que sigue siendo el `claimId` de un intento
`processing`. Con el mismo documento compartido con `complete`,
gana exactamente una operación:

- **Gana complete:** el job referencia `artifactGeneration`; revocación
  rechazada y el drainer no borra S3.
- **Gana la revocación:** el job vuelve a `pending` sin claim ni lease,
  el siguiente attempt obtiene una generación nueva mediante B80 y el
  `complete` tardío con claim anterior falla su CAS.
- **Gana una renovación o un nuevo claim:** el CAS de revocación falla
  cerrado; se conserva el objeto hasta nueva autoridad.
- **Lease inválido o Mongo inaccesible:** no se invoca DELETE.

No se cancela un objeto activo por el simple estado de la cola; se
mantienen B81 multipart-only abort y B75/B77 verificación extendida.

Pruebas nuevas: `node --experimental-strip-types --test
scripts/test-account-export-b82-fence.test.mjs` y
`node scripts/test-account-export-b82-fence-guard.mjs`. Los tests
con Mongo replica-set, S3 real, backup/retención y Node24/pnpm9
permanecen obligatorios para release. `STUDY_PROGRESS_ENABLED=false`,
issue #353 OPEN/HOLD y auditorías #133/#141 sin waiver.

## B83 — Vencimientos de claims evaluados por MongoDB

Las exportaciones no pueden publicar un archivo solo porque
`completedAt` quedó fijado antes de que expirara su lease. Una
finalización, renovación de heartbeat o reprogramación demorada debe
superar también una condición `$expr` evaluada por MongoDB:
`leaseExpiresAt > $$NOW`. La revocación de B82 requiere el inverso
(`leaseExpiresAt <= $$NOW`) además del vencimiento que observa el
worker. De esta manera se protege tanto contra respuestas de Mongo
demoradas como contra un reloj adelantado del proceso que limpia.

El tiempo del primary MongoDB es ahora parte de la autoridad de
publicación. En incidentes, comprobar reloj del primary, NTP,
logs agregados del worker y estado de `account_export_jobs`/
`account_export_orphan_cleanup`. No usar timestamps de cliente para
forzar limpieza ni desactivar CAS.

Tests: `node --experimental-strip-types --test
scripts/test-account-export-b83-mongo-clock.test.mjs`,
`node scripts/test-account-export-b83-mongo-clock-guard.mjs`,
más las pruebas Jest/Mongo replica-set opt-in. Las primeras no prueban
compatibilidad real con el servidor Mongo ni failover. Mantener
`STUDY_PROGRESS_ENABLED=false`, release #353 HOLD y auditorías
#133/#141 abiertas.

## B84 — Reclamos y ACK de limpieza autorizados por horario del primario Mongo

Desde B84, no alcanza con que `input.now` del proceso indique que una
exportación o tarea de limpieza está vencida. El `claimNext` del job
comprueba con `$$NOW` del primario que la tarea `pending` está
efectivamente programada o que el lease `processing` expiró. La
transacción conserva el write-ahead B80 y la custodia de las generaciones.

El `claimNext` de la cola de limpieza valida **en Mongo** tanto el
vencimiento de `nextAttemptAt` como el lease de cualquier proceso
anterior. Una extensión por takeover no se puede ignorar pasando un
reloj adelantado. Los CAS de `renewLease`, `acknowledge` y `retry`
comprueban de nuevo plazo y lease en el primario antes de cambiar o
eliminar el registro.

Un `claimNext` nulo, un ACK rechazado o un retry denegado ante
diferencias de reloj **no autorizan un S3 DELETE directo**. Conservar
las filas de recuperación; revisar hora/NTP del primario, due, claimId,
leaseExpiresAt, verificationUntil y generación propietaria.
No adelantar `input.now` para sortear el período de asentamiento.

Pruebas del bloque:
`node --experimental-strip-types --test scripts/test-account-export-b84-mongo-claim-clock.test.mjs`;
`node scripts/test-account-export-b84-mongo-claim-guard.mjs`;
Jest de ambos stores y suite aislada Mongo replica-set opt-in.
Las pruebas Node interpretan predicados locales, **no sustituyen
la aceptación real de Mongo/S3**. Release #353 sigue HOLD,
`STUDY_PROGRESS_ENABLED=false`, sin waiver de auditorías #133/#141.

## B85 — No retirar exportaciones privadas antes de su vencimiento real

Los siete días de retención no pueden darse por cumplidos solo porque
`now` del worker esté adelantado. Desde B85, la búsqueda de candidatos
y el `findOneAndUpdate` que desvincula una generación exigen un BSON
Date `artifactExpiresAt <= $$NOW` evaluado por el primario MongoDB.
El cliente puede acotar la consulta, pero **no otorgar permiso** para
retirar un archivo ni crear una intención de S3 DELETE.

El retiro y el alta de la intención de limpieza continúan en la misma
transacción B72. Un CAS que falla deja `artifactGeneration` referenciado
y no inserta una tarea S3. Si el vencimiento es real, se registra
exactamente la generación y el borrado queda bajo autoridad de la cola
B78–B84, nunca inline.

Ante incidentes de borrado prematuro, comparar la fecha durable del
artifact, el reloj del primario, NTP y la cola de compensación. No
sustituir `$$NOW` por un timestamp del worker ni modificar a mano el
horizonte de verificación. Regresiones:
`node --experimental-strip-types --test scripts/test-account-export-b85-artifact-expiry.test.mjs`;
`node scripts/test-account-export-b85-expiry-guard.mjs`;
Jest y Mongo replica-set opt-in siguen obligatorios antes del release.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false`, validaciones de S3,
backup, IAM, retención y auditorías #133/#141 pendientes.

## B86 — Prueba integrada de exportación privada ante S3 y Mongo con fallas

B86 incorpora dos niveles de aceptación sin credenciales ni datos reales:

- **HTTP localhost:** `node --experimental-strip-types --test
  scripts/test-account-export-b86-s3-loopback.test.mjs` usa
  `createS3ObjectStorage` real, solicitudes SigV4 por socket y un
  servidor Node mínimo **simulado**, siempre en `127.0.0.1`. Cubre
  PUT/GET/DELETE, pérdida del ACK de PUT y multipart, AbortMultipartUpload,
  error 503 y borrado explícito posterior. No prueba MinIO/AWS real.
- **Mongo local opt-in:** con `STUDY_PROGRESS_TEST_MONGO_URI` apuntando
  a un replica set desechable local, `node
  scripts/run-account-export-b86-local-acceptance.mjs` ejecuta solo
  casos B86 en la suite `study-progress.mongo-int.spec.ts`.
  Valida B80 writeahead, claim revocation B82, un DELETE 503 seguido
  de retry/ACK y preservación de exportaciones referenciadas, usando
  el adaptador S3 real con **transporte HTTP simulado**.

El runner rechaza ausencia de URI, hosts ajenos, credenciales, Node que
no sea 24 y la feature flag de producción activa. Una suite saltada no
puede considerarse aceptación. **No hay conexión real a S3 remoto.**

Para release siguen faltando replica-set y S3 proveedor reales,
TypeScript/Jest/Prettier/lint exact-head, seguridad de IAM, readback,
versionado, lifecycle, backups y aceptación HTTP/browser. Mantener
`STUDY_PROGRESS_ENABLED=false`, issue #353 HOLD y auditorías #133/#141.

## B87 — El simulador S3 exige firma criptográfica válida

Antes de B87, el servidor de aceptación HTTP B86 aceptaba cualquier
cabecera `Authorization` con prefijo `AWS4-HMAC-SHA256`, incluso si
no coincidía con el cuerpo, la clave, la región o la consulta.

Ahora cada solicitud al servidor **solo localhost** valida SigV4
de forma independiente: hash real de bytes, headers y host firmados,
query canónica, clave exacta, fecha, alcance de credencial y firma HMAC.
Las peticiones falsas reciben `403 SignatureDoesNotMatch` **antes**
de modificar el objeto simulado.

Regresiones locales nuevas:
`pnpm test:account-export-b87-sigv4` (9 vectores Node) y
`pnpm test:account-export-b86-s3-loopback` (5 escenarios originales
más 3 solicitudes falsificadas/manipuladas por HTTP real).

**Alcance:** este verificador es exclusivamente de aceptación
local; no es un endpoint público ni reemplaza el servicio S3 de
producción. La validación contra Mongo local es opt-in por B86.
No se ejecutaron en este entorno HTTP loopback completo, Mongo, Jest,
TS o S3 de proveedor. Mantener `STUDY_PROGRESS_ENABLED=false`,
issue #353 HOLD y auditorías #133/#141 pendientes.
