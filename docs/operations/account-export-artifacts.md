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

## B89 — Validación de destino y aislamiento de Mongo en aceptación local

El runner `run-account-export-b86-local-acceptance.mjs` puede crear y
eliminar bases **solo de prueba**. B89 impide que una URI de apariencia
local conecte por DNS o descubrimiento de miembros a un Mongo remoto.

Antes de iniciar Jest comprueba protocolo, puerto, ausencia de usuario,
contraseña y base explícita, y un único `replicaSet` sin opciones
adicionales. Admite `127.0.0.1`, `localhost` y `::1` únicamente
si **todas las direcciones resueltas** son loopback. Fija luego la IP
verificada en la URI y agrega `directConnection=true`, para no
redirigirse a otro miembro por descubrimiento de topología.

**Cambio intencional:** `mongo` como hostname de Docker deja de ser
válido en este ejecutor seguro. Exponer/reenviar el replica set
desechable a un puerto del host en loopback (sin credenciales reales).
No pegar aquí URIs con secretos.

Prueba que no conecta a Mongo:
`node --test scripts/test-account-export-b89-local-mongo-uri.test.mjs`.

La aceptación que sí utiliza Mongo requiere por separado Node24/pnpm9,
URI de replica set local y confirmación del primario:
`pnpm test:account-export-b86-local-acceptance`.
Estos ensayos no deben ejecutarse contra producción ni staging.
`STUDY_PROGRESS_ENABLED=false` y issue #353 HOLD siguen vigentes;
Jest/Mongo real, S3 de proveedor, backups, IAM y auditorías #133/#141
permanecen pendientes.

## B90 — Comprobar S3 GET antes de publicar exportaciones

Desde B90, el ACK de `PUT Object` o `CompleteMultipartUpload` no
basta para marcar una exportación privada como `completed`.
`S3AccountExportArtifactStorage` relee **la misma generación** por GET
en streaming y compara la longitud y SHA-256 contra el resultado
calculado por el ensamblador. Solo después devuelve éxito al worker,
que puede escribir el estado publicado en MongoDB.

Cualquier truncamiento, dato alterado, respuesta excesiva, GET 404/503
o error de streaming impide publicar. El worker conserva el mecanismo
de reintento y la cola de limpieza durable B80/B78; B81 sigue
prohibiendo DELETE directo desde `abort()`.

Diagnóstico: buscar errores `Account export S3 readback...`, estado
del claim en Mongo, registro de generación en
`account_export_orphan_cleanup` y operaciones GET del objeto exacto.
No eliminar manualmente un objeto con resultado incierto ni
eludir owner/lease/verificationUntil de la cola.

Regresiones: `pnpm test:account-export-b90-readback` (9 casos Node
ejecutables); Jest storage y Mongo replica-set opt-in (B90 y B86
ajustados), Node24/pnpm9, pruebas reales de S3/provider y readback.
La lectura añade un GET completo por exportación y exige evaluar
costos/performance antes de liberar.

`STUDY_PROGRESS_ENABLED=false`; issue #353 HOLD.
Auditorías #133/#141, proveedor S3, backups, versioning, IAM,
TypeScript/Jest/HTTP/browser pendientes; no CI manual ni deploy.

## B91 — Preflight de integridad antes de iniciar una descarga privada

El endpoint `GET /account/exports/:id/download` hace una comprobación
adicional **después** de validar el propietario, estado, vencimiento
y generación, pero **antes** de enviar headers y bytes al navegador.

`verifyReadable` abre un GET autenticado para la generación exacta y
comprueba el tamaño y SHA-256 con lectura en streaming (mismo verificador
de B90). Ante objeto corrupto, truncado, ausente, GET 503 o respuesta
inesperada, el endpoint devuelve 503 con código estable
`ACCOUNT_EXPORT_STORAGE_UNAVAILABLE` y sin detalles del bucket.
No se abre un adjunto parcial cuando el daño ya existía al empezar.

Si el cliente corta la conexión durante el preflight, se cancela la
lectura; si continúa, el segundo GET del adjunto mantiene el verificador
de integridad y las cabeceras `private, no-store`.

**Limitación:** el objeto aún puede cambiar entre ambos GET si un
principal posee permisos de escritura sobre su clave. En ese caso el
streaming detecta corrupción tardía, pero los bytes enviados no se
pueden retirar. Revisar IAM/versionado/inmutabilidad antes del release.

**Impacto:** una descarga completa requiere un GET adicional de
preflight; medir latencia, ancho de banda y costo con archivos grandes.
Un fallo no autoriza un DELETE S3 en el controlador. La limpieza sigue
bajo B78–B85.

Pruebas: `pnpm test:account-export-b91-preflight`, Jest del controlador
y del adaptador, aceptación HTTP real y proveedor S3. Estas últimas
siguen pendientes. **#353 HOLD**, `STUDY_PROGRESS_ENABLED=false`,
auditorías #133/#141, IAM, backup, Mongo y CI completo pendientes.

## B92 — Reautorizar después del preflight de exportación privada

Las descargas privadas ejecutan el siguiente circuito:

1. Validar sesión, cuenta, propiedad, estado y vigencia en Mongo.
2. Comprobar S3 GET (preflight B91) con tamaño y SHA-256 exactos.
3. **Volver a consultar Mongo antes de emitir headers** para comprobar
   que la cuenta sigue activa y que la misma generación, versión,
   tamaño y hash continúan autorizados y no vencidos.
4. Iniciar un segundo GET con el chequeo SHA-256 durante el stream.

Si cambió el estado: 404, 409 o 410 según corresponda. Si cambió
la metadata/generación ya verificada: 409 estable con código
`ACCOUNT_EXPORT_CHANGED_DURING_VERIFICATION`. Si S3 falla durante
preflight: 503 `ACCOUNT_EXPORT_STORAGE_UNAVAILABLE`. Ningún error
incluye object key, credenciales o contenido del archivo.
Un cliente desconectado durante la consulta tampoco recibe adjunto.

B92 cierra una ventana de autorización causada por el GET largo de B91,
pero no crea un lease de descarga ni inmoviliza una versión durante
todo el segundo GET. Para cerrar esta carrera residual se requieren
permisos de objeto inmutable/versionado o una sesión de descarga
con retención respaldada en storage, además de pruebas de carrera
HTTP/Mongo/S3 reales.

Ejecutar `pnpm test:account-export-b92-reauthorization` y los Jest
del controlador, Node24/pnpm9, ensayos HTTP/browser y S3 real.
Medir latencia por el doble GET y dos consultas a Mongo.

**#353 HOLD, `STUDY_PROGRESS_ENABLED=false`**.
No CI manual, no deploy ni exención de auditorías #133/#141.

## B93 — Estado y descarga privados usan el mismo reloj que la limpieza

Para exportaciones completadas, `status.downloadable` y la decisión
de `download()` consultan el primario MongoDB mediante un filtro
propietario/generación/fecha exactos y `artifactExpiresAt > $$NOW`.
Esto evita que la API y la cola de retiro B85 discrepen porque uno de
los workers tenga el reloj adelantado o atrasado.

Si el primario no puede validar el objeto y su vencimiento, la
descarga **no se autoriza**. Si la consulta falla, se propaga el
error; no se ignora ni se reemplaza silenciosamente con `Date.now()`.
La segunda reautorización B92 sigue ocurriendo después del preflight
S3 y antes de los headers; no crea un lease durante el stream.

Pruebas: `pnpm test:account-export-b93-mongo-download-clock` valida
predicados puros; Jest service/store y suite replica-set aislada
opt-in validan la consulta real en Mongo. La suite Node sola no
constituye aceptación Mongo ni S3.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false`. Sin CI manual, sin
deploy; pendientes Node24/pnpm9, Mongoose real, S3 IAM/versioning,
HTTP/browser, backup/lifecycle y auditorías #133/#141.

## B94 — Aceptación Mongo + S3 con evidencia obligatoria 5/5

El ejecutor local histórico
`pnpm test:account-export-b86-local-acceptance`
antes seleccionaba **solo B86**, dejando sin correr los escenarios
opt-in nuevos B90 (S3 GET corrupto) y B93 (autoridad del reloj
Mongo primario). Ahora exige los **cinco tests B86/B90/B93** y
un reporte JSON válido de Jest; ni `exit 0` ni `--passWithNoTests=false`
se consideran suficientes sin cinco `passed` explícitos.

Antes de iniciar Jest, valida el inventario de títulos y conserva
el gate B89 de replica set local sin credenciales, IP loopback numérica,
`directConnection=true`, Node24 y feature flag desactivada.
Una selección incompleta o reporte ausente da salida no cero.
El JSON de aceptación se guarda temporalmente y se elimina
también después de errores.

Primero: `pnpm test:account-export-b94-proof` (contrato Node sin Mongo).
Luego, únicamente en replica set desechable local:
`STUDY_PROGRESS_ENABLED=false STUDY_PROGRESS_TEST_MONGO_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' pnpm test:account-export-b86-local-acceptance`.

El resultado 5/5 de ese comando significa Mongo real y adaptador
S3 real con respuestas HTTP **simuladas**, no aceptación AWS/MinIO.
No se modifican condiciones de limpieza B78–B85 ni descarga
B90–B93. **Issue #353 HOLD** hasta Node24/Jest/Typescript/S3 de
proveedor, auditorías #133/#141, IAM/versioning, backup y HTTP/browser.
Sin CI manual ni deploy.

## B95 — Verificación B90/B91 contra transporte S3 HTTP local firmado

El script `test-account-export-b86-s3-loopback.test.mjs` conserva
todos los escenarios B86/B87 y suma seis casos B95 usando
`createS3ObjectStorage` de producción, solicitudes HTTP reales
a `127.0.0.1` y validación criptográfica SigV4 independiente.

El servidor de prueba puede devolver GET con HTTP 200 pero cuerpo
corrupto, más corto o más largo; 404/503; y una secuencia donde el
preflight B91 pasa y el segundo GET falla por hash. Esas situaciones
deben fallar en los verificadores reales B90/B91 sin autorizar
DELETE directo del objeto almacenado.

Comando aislado:
`pnpm test:account-export-b95-http-integrity`.
Suite HTTP completa con B86/B87:
`pnpm test:account-export-b86-s3-loopback`.

Este es un S3 **simulado** por HTTP localhost, no AWS/MinIO.
Se deben ejecutar ambos comandos en el entorno Node24/pnpm9;
no interpretar pruebas estáticas como PASS de red.
El conjunto durable Mongo B86/B90/B93 sigue con su runner B94
separado. **#353 HOLD**, `STUDY_PROGRESS_ENABLED=false`,
sin CI manual ni despliegue; pendientes pruebas Mongo/S3 de proveedor,
seguridad #133/#141, backups, IAM/versionado y HTTP navegador.

## B96 — HTTP 200 no garantiza una carga multipart S3 completada

`createMultipartWriter().complete()` ahora requiere un XML
`CompleteMultipartUploadResult` reconocido, además del código HTTP
exitoso. Las respuestas vacías, HTML, un XML ajeno, un `<Error>`
embebido o un resultado incompleto mantienen la finalización como
**no confirmada**, aunque el proveedor haya devuelto HTTP 200.

En una exportación privada, un resultado ambiguo conserva la intención
de recuperación B80 y `abort()` cancela únicamente el `uploadId`;
B81 sigue impidiendo el DELETE directo del objeto. El readback B90
sigue siendo obligatorio aun después de una confirmación válida.

Pruebas: `pnpm test:account-export-b96-multipart` para los vectores
puros Node; `pnpm test:account-export-b86-s3-loopback` para red S3
simulada firmada; Jest `s3-object-storage.spec.ts` para regresión
del writer. Las últimas dos aún requieren ejecución real.

La validación del XML no sustituye la aceptación de AWS/MinIO ni
demuestra que el objeto exista. **#353 HOLD**,
`STUDY_PROGRESS_ENABLED=false`; Node24/pnpm9/Jest/Mongo/S3 proveedor,
IAM/versionado, backups y auditorías #133/#141 pendientes. Sin CI
manual ni despliegue.

## B97 — Límite de memoria de confirmación S3 antes de XML

El writer multipart ya no usa `response.text()` para leer
`CompleteMultipartUpload`: eso cargaba todo un cuerpo HTTP 200 antes
de aplicar el límite XML de B96. B97 lee el body por streaming con un
límite de **65 536 bytes reales**, cancela el reader en exceso o error,
rechaza UTF-8 inválido y recién entonces exige el envelope B96.

Si el proveedor emite un cuerpo demasiado largo o una lectura rota,
no se marca `completed`, se conserva el `uploadId` y el `abort()`
de una exportación privada sigue **sin eliminar el objeto**: la cola
durable B80/B78 maneja el estado ambiguo. Los fallos deben investigarse
sin borrar manualmente generaciones posiblemente publicadas.

Pruebas: `pnpm test:account-export-b97-multipart` (12 tests Node,
incluyendo HTTP real loopback), `pnpm test:account-export-b86-s3-loopback`
(SigV4 local) y Jest `s3-object-storage.spec.ts`. Solo la primera suite
ha sido ejecutada y aprobada durante B97; las otras siguen pendientes.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false`; sin CI manual ni
deploy. Pendientes acceptance de Mongo, AWS/MinIO, IAM, backup,
auditorías #133/#141, Node24/TS/lint y navegador.

## B99 — XML estructural de multipart antes de confirmar la exportación

B96 validaba el envelope exterior, pero una respuesta S3 HTTP 200 podía tener
campos mal anidados o incongruentes. B99 exige que la respuesta completa de
CompleteMultipartUpload contenga un ETag único, no vacío, y solo campos escalares
de S3 reconocidos (Location, Bucket, Key y checksums). Rechaza etiquetas
mal cerradas o duplicadas, entidades XML inválidas, DTD, CDATA, comentarios y
contenido inesperado. Conserva solo por compatibilidad con el laboratorio
B86 el XML autocerrado del simulador.

Orden obligatorio: HTTP 2xx → B97 límite streaming de 65 536 bytes →
B99 estructura XML → B90 GET con tamaño y SHA-256 antes de publicar. El ETag
**no sustituye** la verificación SHA-256 del objeto almacenado. Un
CompleteMultipartUpload ambiguo conserva uploadId, y el aborto de exports
privados solo cancela ese uploadId. No realizar un DELETE Object directo:
la cola owner-fenced decide limpieza.

Pruebas locales: pnpm test:account-export-b99-xml,
pnpm test:account-export-b86-s3-loopback y
pnpm test:account-lifecycle-contract. Se aprobaron cinco casos Node B99
aislados en Node22, con archivos equivalentes por hash al branch GitHub.
Los nuevos casos Jest y de servidor firmado TCP, la cadena completa
Node24/pnpm9, Mongo replica y el proveedor real no fueron ejecutados
en esta pasada. El contrato XML estricto requiere conformance del proveedor
antes de habilitarlo en producción; no asumir que toda extensión es válida.

**#353 HOLD**, STUDY_PROGRESS_ENABLED=false; sin CI manual ni deploy.

## B100 — Confirmación acotada del inicio multipart (CreateMultipartUpload)

El adaptador compartido S3 todavía utilizaba response.text() sin límite para
el HTTP 200 de CreateMultipartUpload y buscaba UploadId mediante regex aunque
el servidor devolviera una respuesta ajena, repetida o adulterada. B100 aplica
el lector incremental B97 a esta respuesta (65 536 bytes, UTF-8 fatal,
cancelación del reader) y valida un único InitiateMultipartUploadResult con
UploadId no vacío, acotado y sin caracteres de control; si Bucket/Key están presentes, se comparan con el destino real antes de firmar
ningún PUT de partes.

Si S3 inició un multipart pero la respuesta fue inválida, la API **no posee un
UploadId confirmado** para abortarlo de manera confiable. No debe inferirlo de
errores arbitrarios ni emitir DELETE Object sin owner fencing. El lifecycle
del bucket que aborta multipart incompletos sigue siendo obligatorio y debe
comprobarse con proveedor real. Para exportaciones privadas B80/B81 controlan
los objetos que pudieran quedar publicados; B90 continúa exigiendo GET con
tamaño y SHA-256 antes de completar la publicación.

Pruebas de aceptación del bloque:
- pnpm test:account-export-b100-initiation
- pnpm test:account-export-b86-s3-loopback
- pnpm test:account-lifecycle-contract

Los 9 casos Node del helper/parser (incluido HTTP 127.0.0.1) fueron ejecutados y aprobados en Node22 con los hashes exactos de la rama; el typecheck aislado también pasó. Los casos puros de parser/stream y de HTTP localhost se ejecutan sin
proveedor externo ni credenciales productivas. La suite completa de Nest/Jest,
Mongo replica, S3 real, IAM, lifecycle/backup, navegador, auditorías y release
exact-head requiere evidencia adicional: no aceptar una simulación como
conformidad productiva.

**#353 HOLD**, STUDY_PROGRESS_ENABLED=false, sin CI manual ni despliegue.

## B101 — Aceptación HTTP firmada: loader TypeScript y TAP anti-skips

La batería B86/B95 sobre HTTP firmado y el adaptador S3 real no podía
importar módulos Nest TypeScript sin extensión bajo Node --experimental-strip-types
por sí solo (ERR_MODULE_NOT_FOUND reproducido en Node22). El nuevo loader
**solo para pruebas** resuelve imports relativos a .ts dentro de apps/api/src,
sin ampliar la resolución a rutas externas ni cambiar imports de producción.

Los comandos B86/B95 y el lifecycle cargan el resolver. Dos casos SigV4
B101 comprueban inicio multipart con Bucket/Key correctos, GET+SHA-256 real
sobre localhost y rechazo de key ajena sin subir partes ni borrar objetos.
El runner B101 exige TAP completo, todos los casos PASS (22 tests de la
matriz) y cero skipped, failed, cancelled o todo: una salida 0 sin
casos realmente ejecutados no es aceptación válida.

**Comandos operativos** (checkout canónico, sin credenciales cloud):
- pnpm test:account-export-b101-signed-http
- pnpm test:account-export-b86-s3-loopback
- pnpm test:account-export-b95-http-integrity
- pnpm test:account-lifecycle-contract

El problema y el registro ESM se reprodujeron sobre un fixture Node22 mínimo
(1/1 caso); **no se ejecutó aquí la matriz completa** del adaptador firmado
sobre un checkout Node24. Node22 es solo diagnóstico; las pruebas Jest,
Mongo replica, bucket real S3/MinIO, lifecycle de uploads, backup y
auditorías #133/#141 continúan pendientes. No certificar release con
un test local del loader ni confundir loopback firmado con AWS externo.

**#353 HOLD**, STUDY_PROGRESS_ENABLED=false; sin CI manual ni despliegue.

## B102 — Confirmación multipart S3 vinculada al objeto privado

B99 validaba el XML estructural de CompleteMultipartUpload pero no cotejaba
los campos Bucket y Key de la respuesta con el destino solicitado al proveedor.
Un HTTP 200 con ETag y resultado de otro bucket/objeto podía marcar el writer
como completado sin la evidencia correcta (B90 SHA-256 seguía como defensa
independiente de publicación). B102 compara los nombres **decodificados** de
Bucket/Key, cuando S3 los informa, con los parámetros usados para firmar el
request. Ante mismatch el ACK es ambiguo/no confirmado: no marcar completed,
conservar uploadId para abortar solo la subida multipart. No emitir DELETE
Object directo de exportación privada. El worker owner-fenced B80/B81
conserva la autoridad de limpieza y B90 GET+SHA-256 sigue siendo obligatorio.

Compatibilidad: se admiten XML válidos sin Bucket/Key para S3 simulados y
la forma autocerrada B86, que NO certifican conformance de proveedor real.
Se corrigió además el fixture positivo B99 de HTTP firmado para declarar
el bucket/key real.

Pruebas:
- pnpm test:account-export-b102-binding
- pnpm test:account-export-b101-signed-http
- pnpm test:account-lifecycle-contract

Se ejecutaron 20/20 callbacks aislados de B96/B99/B102 mediante V8 sobre
blobs GitHub, eliminando solo las anotaciones TypeScript; 20/20 PASS.
Se verificaron 10/10 contratos cruzados de fuente GitHub.
No se ejecutó la cadena Node24/pnpm9 del checkout, Jest, ni los 23 tests
completos de HTTP SigV4, Mongo replica o AWS/MinIO con lifecycle/IAM.
No declarar aceptación productiva por pruebas aisladas.

**#353 HOLD**, STUDY_PROGRESS_ENABLED=false; sin CI manual ni deploy.

## B103 — Confirmación S3 multipart con ETag real, nunca ACK autocerrado

Se eliminó la excepción de prueba B86 que aceptaba
`<CompleteMultipartUploadResult/>` bajo HTTP 200 como éxito sin ETag.
El simulador HTTP firmado responde ahora con un XML completo con
`Bucket`, `Key` y `ETag`. El parser exige ETag semánticamente no
vacío tras decodificar entidades XML, cerrando también el caso
`<ETag>&#32;</ETag>` (espacio codificado). Nunca marcar
`completed=true` con una confirmación autocerrada.

Si el proveedor persiste el objeto pero entrega un ACK no confirmado,
conservar `uploadId` para abortar **solo** ese multipart, sin DELETE
Object directo de exportación privada. B80/B81 mantienen la limpieza
durable bajo autoridad del propietario y B90 mantiene GET+SHA-256.

Pruebas en checkout canónico:
- pnpm test:account-export-b103-etag
- pnpm test:account-export-b101-signed-http
- pnpm test:account-lifecycle-contract

**Evidencia disponible:** V8 aislado del validador sobre blobs GitHub,
red/green: el parser anterior falló dos grupos B103 y el nuevo pasó
25/25 grupos B96+B99+B102+B103. **No se ejecutaron** aquí los 24
escenarios TCP SigV4 completos, Jest, ni el lifecycle en Node24/pnpm9.
Ni esta evidencia ni un simulator S3 habilitan producción: pendiente
Mongo replica B94, S3 real con IAM/lifecycle, backups, auditorías y
aceptación #353.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false` en producción;
sin CI manual ni despliegue.

## B104 — Writer multipart con fallos terminales, sin publicación de partes truncadas

Se cerró un defecto del adaptador genérico S3: flushPending() quitaba bytes
locales antes del PUT de la parte. Si una parte fallaba o perdía su ACK,
el writer podía intentar completar únicamente las partes previas ya
confirmadas y publicar un objeto truncado. Se añadió `failed` irreversible:
después de cualquier error en write() o complete(), no admitir más
write/complete en esa generación. Mantener abort() autorizado solo sobre
uploadId conocido. Con `deleteObjectOnAbort:false` nunca emitir DELETE
Object directo de exportación privada; B80/B81 preservan owner fencing y
B90 GET/SHA continúa obligatorio.

El fixture TCP B86 aplica fallos de partes 503 luego de la comprobación
SigV4 independiente. Cuatro escenarios B104 cubren error en primera parte,
error en segunda parte (tras éxito de primera), ACK final ambiguo y ACK
perdido de PUT simple. El runner de aceptación se actualizó a **28 casos
B86–B104**, todos requeridos con TAP exacto y sin skips.

Comandos en checkout canónico:
- pnpm test:account-export-b104-fail-closed
- pnpm test:account-export-b101-signed-http
- pnpm test:account-lifecycle-contract

**Evidencia pendiente:** sin checkout de GitHub ni Node24/pnpm9 no se
ejecutó acá la batería TCP completa, Nest/Jest ni Mongo replica B94.
Los guards de código no son aceptación productiva. También pendientes
proveedor S3/MinIO real, IAM/lifecycle, backup/restore, navegadores
y auditorías #133/#141.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false`; sin CI manual ni deploy.

**Evidencia B104 complementaria:** se extrajo y ejecutó en V8 el método
productivo `createMultipartWriter` en versión anterior y corregida,
con dependencias de transporte sustituidas y umbral de parte de cinco
bytes. Reproducción 4 escenarios: en la versión antigua, segunda parte
fallida permitía completar un objeto truncado, ACK ambiguo podía
re-POST Complete y PUT simple se retransmitía; con B104 los tres
reintentos peligrosos quedaron bloqueados. Ver informe técnico B104.
No es la batería TCP SigV4/Node24.

## B105 — Serialización FIFO de operaciones sobre writer S3

La corrección B104 de fallos terminales no impedía carreras entre llamadas
simultáneas del mismo writer: dos write() podían crear dos uploads o partes
número 1; complete() podía adelantarse a un inicio multipart y ejecutar
un PUT de cero bytes; abort() podía ejecutarse sin conocer todavía el
uploadId; complete() simultáneos podían repetir PUT de una generación.

B105 introduce una cola FIFO por writer. Copia los bytes de cada write()
al aceptar la llamada; complete() y abort() establecen sus fences de
escritura sincrónicamente, antes de entrar en cola. Abort espera las
subidas previamente aceptadas para cancelar el uploadId correcto.
La cola recupera fallos solo internamente y entrega el rechazo original;
B104 mantiene estado failed irreversible y bloquea finalizaciones
tras fallos. **Exportaciones privadas:** deleteObjectOnAbort:false, sin
DELETE Object directo; ownership de cleanup B80/B81 y readback B90.

Se agregaron cinco tests Jest del adaptador y cuatro pruebas HTTP
localhost con SigV4 B87, con inventario 32 casos B86–B105 y TAP
anti-skips. Comandos del checkout canónico:
- pnpm test:account-export-b105-concurrency
- pnpm test:account-export-b101-signed-http
- pnpm test:account-lifecycle-contract

**Evidencia aislada red/green:** cuatro escenarios de escritura concurrente
sobre la lógica productiva extraída de los blobs GitHub B104/B105,
quitando tipos TS y sustituyendo el transporte en V8, umbral de
parte reducido a cinco bytes. Versión anterior duplicaba inicios/partes,
permitía PUT simple anticipado, perdía el abort multipart y
repetía PUT de complete concurrente. Versión B105 serializa.
Este resultado **no** constituye aprobación de TCP SigV4/Jest en Node24.

Pendientes los 32 escenarios completos sobre checkout Node24/pnpm9,
Jest/typecheck/lint, Mongo replica B94, AWS/MinIO IAM/lifecycle,
backup/restore, navegador y auditorías #133/#141.

**#353 HOLD**, STUDY_PROGRESS_ENABLED=false; sin CI manual ni despliegue.

## B106 — Backpressure y memoria acotada para la cola S3

B105 copia inmediatamente cada chunk concurrente antes de encolarlo.
B106 evita memoria sin límite cuando el transporte S3 está detenido
o el llamador omite await: cada writer admite hasta **16 MiB de snapshots
pendientes/activos** y **32 operaciones write()**. Superar cualquiera
pone `failed=true` de forma irreversible **antes** de copiar, impidiendo
`complete()` sobre una exportación parcial. `abort()` sigue permitido
y owner-safe: para cuenta privada, `deleteObjectOnAbort:false`
prohíbe DELETE Object directo de una generación quizá persistida.

Los snapshots se limpian tras éxito/error mediante `snapshot.fill(0)`
y ambos contadores se liberan en `finally`. El límite es de snapshots
de la cola, **no cota de memoria total** del proceso. Los productores
deben esperar cada `write()` (backpressure), dividir chunks mayores a
16 MiB y abrir una nueva generación autorizada tras cualquier overflow.

Se agregaron cuatro regresiones Jest (chunk mayor al máximo, burst de
tres partes y rechazo de la cuarta, 33 writes vacíos, cuatro partes
secuenciales) y dos HTTP localhost con firma independiente B87.
Inventario firmado: **34 escenarios B86–B106** con TAP anti-skips.

Comandos en checkout canónico:
- pnpm test:account-export-b106-bounded-queue
- pnpm test:account-export-b101-signed-http
- pnpm test:account-lifecycle-contract

**Evidencia disponible:** 4/4 escenarios red-green en V8 sobre
método productivo B105/B106 recuperado de GitHub, quitando tipos
TS y sustituyendo transporte, parte de cinco bytes, presupuesto
de dieciséis bytes proporcional. No sustituye ejecución real de
los 34 TCP SigV4 ni Jest/Node24. Persisten pendientes Mongo réplica
B94, S3/MinIO real IAM/lifecycle, backup/browser y auditorías #133/#141.

**#353 HOLD**, STUDY_PROGRESS_ENABLED=false; sin CI manual ni despliegue.

## B107 — Node 24 obligatorio para aceptación S3 firmada; TAP verificable

A partir de B107, `scripts/run-account-export-b101-signed-http.mjs`
requerirá **Node24 sin argumentos** para devolver éxito como
aceptación de los 34 escenarios TCP localhost B86–B106. En Node22,
el comando normal falla con salida 2 **antes de ejecutar ninguna prueba**;
solo `--diagnostic-node22` permite diagnosticar en esa versión,
marcando explícitamente **NOT release acceptance**.

El verificador TAP ya no confía solamente en `# tests` y `# pass`:
exige plan único `1..34`, subtests en orden, números PASS 1..34,
nombres exactos y cero fallas/skips/todo/cancelaciones. Mantiene
verificación de firma SigV4 independiente B87 y la limitación
127.0.0.1 del servidor local.

Comandos:
- `pnpm test:account-export-b107-contract`: unidad nativa de gate/TAP y guard de fuente
- `pnpm test:account-export-b107-release-acceptance`: **Node24** más 34 TCP firmados obligatorios
- `pnpm test:account-export-signed-http-diagnostic-node22`: diagnóstico explícito sin valor de GO
- `pnpm test:account-lifecycle-contract`: mantener todos los contratos anteriores y B107

**Evidencia nativa real:** en Node22.16.0 se ejecutaron **13/13
tests nativos** de B107, con cero fails/skips; los cuatro archivos
TAP, runtime, gate y runner materializados para esas pruebas
tienen hashes Git blob idénticos a los de la rama GitHub.
Las dos pruebas de proceso usan un **inventario sustituto de 34
nombres** para el preflight, sin realizar peticiones ni ejecutar el
adaptador S3: verifican que Node22 falle anticipadamente con
exit 2 y que `STUDY_PROGRESS_ENABLED=true` siga prohibido.
Esto valida la política de ejecución y el parsing de evidencia,
**no** la batería TCP real ni la ejecución en Node24.

Siguen pendientes el checkout Node24/pnpm9 y 34 escenarios TCP
contra el adaptador real, Nest/Jest, Mongo B94, IAM/lifecycle
AWS/MinIO, backup/restore, navegador y auditorías #133/#141.

**#353 HOLD**, STUDY_PROGRESS_ENABLED=false en producción;
sin CI manual ni despliegue.

**Evidencia B107 ampliada:** también se ejecutaron los 5 tests B101
originales del parser TAP/resolver ESM (blobs GitHub exactos),
con dos módulos TS vacíos únicamente como archivos de existencia.
El agregado **B101 (5) + B107 (13) pasó 18/18** con `node --test`
en Node22.16.0, sin fallos, omisiones o todo. Esta unidad nativa
es distinta de correr el adaptador S3 firmado de producción.

## B108 — Validación acotada del ETag de cada parte multipart

Un `HTTP 200` de UploadPart no basta para aceptar un header `ETag`
arbitrario. Antes de añadir una parte a `CompleteMultipartUpload`,
el adaptador valida el ETag mediante el módulo B108:
límite de **256 caracteres** de header, comillas exteriores
obligatoriamente equilibradas si están presentes, token imprimible
sin whitespace/controles/comillas interiores ni barras invertidas.
Se conservan los formatos opacos sin comillas de proveedores
compatibles y el escape XML `xmlEscape`.

Si el header está malformado, el writer B104 queda fallido, no
permite `complete()` y conserva el `uploadId` para abortar.
La exportación privada nunca realiza DELETE Object directo cuando
`deleteObjectOnAbort:false`: B80/B81 siguen siendo autoridad
de limpieza y B90 GET+SHA256 continúa antes de publicar.

Comandos:
- `pnpm test:account-export-b108-part-etag` — 5 casos de parser y guard
- `pnpm test:account-export-b107-release-acceptance` — **Node24**,
  los **36 escenarios TCP SigV4 B86–B108** requeridos
- `pnpm test:account-lifecycle-contract` — cadena completa de contratos

**Evidencia:** B108 parser/test nativos de Node22.16.0 **5/5 PASS**
con ambos archivos idénticos a sus Git blobs. Los escenarios HTTP
firmados reales, Jest, typecheck/lint, Mongo replica B94,
S3/MinIO IAM/lifecycle, backups y auditorías #133/#141
no se ejecutaron aquí.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false`, sin CI manual
ni despliegue.

## B109 — Lectura acotada del prefijo GET Range S3

Se detectó que `S3ObjectStorage.readPrefix()` enviaba un GET Range
firmado correctamente, pero llamaba a `response.arrayBuffer()`
**antes** de comprobar `maximumBytes`. Un proveedor que ignorase
Range podía obligar a descargar un archivo enorme incluso
al solicitar un prefijo de pocos bytes.

B109 reemplaza el buffering completo por
`readBoundedS3PrefixBody()`: lectura incremental sobre el stream,
verificación de cota **antes de copiar cada chunk**, cancelación
de la respuesta ante overflow o fallo, resultado de bytes exactos,
chunks vacíos descartados para que no acumulen referencias.
Se mantiene el GET firmado SigV4 y la compatibilidad de
respuesta vacía. El límite se aplica a los bytes retenidos por
el helper; no impide que un chunk se materialice previamente
en el cliente HTTP.

**Evidencia:** 8/8 pruebas `node:test` reales de la función
TypeScript en Node22.16.0, con archivos cotejados por SHA Git.
Tres casos Jest del adaptador y dos TCP SigV4 B87 agregados;
inventario firmado obligatorio **38 casos B86–B109**,
no ejecutado en Node24 todavía.

Ejecutar en checkout canónico:
- `pnpm test:account-export-b109-bounded-prefix`
- `pnpm test:account-export-b107-release-acceptance` (**Node24 obligatorio**)
- `pnpm test:account-lifecycle-contract`

Quedan sin aprobación: 38 escenarios TCP reales en Node24/pnpm9,
Nest/Jest, typecheck/lint, Mongo replica B94,
S3/MinIO con IAM/lifecycle, backup/restore y auditorías #133/#141.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false` en producción,
sin CI manual ni despliegue.

## B110 — Range firmado en GET S3 SigV4

La lectura de prefijo `readPrefix()` enviaba el header Range
pero este no estaba incluido en `SignedHeaders`. B109 protege
la cantidad de bytes copiados al proceso, pero sin firma
del Range, un proxy podía alterar la ventana solicitada sin
invalidar las credenciales SigV4 de la llamada.

B110 agrega un helper puro para todos los headers adicionales
de los GET/HEAD/DELETE firmados. `range` ahora participa de
la CanonicalRequest y de su firma; se rechazan nombres/valores
malformados, sobrescrituras de host/date/hash/authorization
y duplicados por casing. GET completo y HEAD mantienen
su conjunto anterior de headers. Se mantienen B90 readback
SHA256, B109 límite incremental de lectura y B80/B81
owner-fenced cleanup para exportaciones privadas.

**Evidencia:** 7/7 pruebas nativas Node22.16.0 PASS sobre
la función TS genuina (blobs Git cotejados). Dos regresiones
Jest y dos HTTP localhost SigV4 con mutación de Range
y verificador independiente B87 agregadas al repositorio.
Runner de aceptación: **40 casos B86–B110**, sin skips,
Node24 obligatorio.

```sh
pnpm test:account-export-b110-signed-range
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

**Pendiente:** ejecutar los 40 casos TCP en checkout Node24
y las pruebas Nest/Jest, TypeScript, Mongo B94,
proveedor AWS/MinIO IAM/lifecycle, backup/restore y
auditorías #133/#141. Los tests nativos y los guards
no certifican GO.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false` en
producción; sin CI manual ni despliegue.

## B111 — HTTP 206 Content-Range coherente con GET de prefijo S3

B109 limitaba los bytes de `readPrefix()` y B110 firmaba el
encabezado Range de la petición, pero las respuestas **HTTP 206**
podían declarar cualquier `Content-Range`, incluyendo rangos
de origen distinto de cero, ventanas incompletas y cuerpos más
cortos que los declarados. Un escáner no debe tratar esos bytes
como los primeros del archivo privado.

B111 exige para 206 un `Content-Range: bytes 0-END/TOTAL`
con enteros seguros, TOTAL mayor al END y
`END=min(maximumBytes,TOTAL)-1`. La lectura incremental
debe recibir exactamente END+1 bytes; ante metadata o longitud
incorrecta se cancela el stream y se rechaza sin publicar ni
eliminar el objeto. HTTP 200 sigue permitido para objetos completos
pequeños cuando el proveedor ignora Range; la cota B109 se conserva.
Se rechazan otros 2xx inesperados para GET de prefijo.

**Evidencia obtenida:** 10/10 casos nuevos nativos B111 y
8/8 de B109 anteriores pasaron juntos en Node22.16.0,
usando el loader TypeScript B101 existente (18/18 total,
sin skips). Los archivos ejecutados coinciden con sus hashes
Git blob. Tres pruebas Jest del adaptador y dos nuevos
escenarios localhost SigV4 B87 quedaron definidos.
El inventario obligatorio pasa a **42 casos B86–B111**.

Comandos en el checkout canónico:
- `pnpm test:account-export-b111-content-range`
- `pnpm test:account-export-b107-release-acceptance` (**Node24**)
- `pnpm test:account-lifecycle-contract`

**No ejecutado/aceptado aún:** los 42 casos TCP firmados
completos en Node24/pnpm9, Jest/Nest, typecheck/lint, Mongo
réplica B94, proveedor AWS/MinIO IAM/lifecycle, backup/restore,
navegadores y auditorías #133/#141.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false` productivo;
sin CI manual ni despliegue.

## B112 — Firmas S3 multipart y protección de metadatos reservados

El signer de cuerpos S3 (`signedBodyRequest`, POST/PUT/DELETE)
admitía encabezados adicionales que podían sobrescribir los valores
firmados de host, `x-amz-date`, `x-amz-content-sha256` e incluso
`authorization`. Era un comportamiento distinto al signer
de lectura reforzado en B110. En B112 ambos usan el mismo
`collectS3SignedRequestHeaders` para impedir overrides,
duplicados por mayúsculas e inyecciones CR/LF/NUL antes de fetch.

La iniciación multipart legítima conserva Content-Type
normalizado y firmado; las partes PUT/finalizaciones sin
Content-Type preservan sus SignedHeaders anteriores.
La validación evita cabeceras ambiguas; **no cambia**
autorizaciones privadas, S3 paths, ni owner-fenced cleanup.

**Evidencia:** 8/8 unidades B112 sobre TypeScript real en
Node22.16.0, con fuentes cotejadas por Git blob, y comparación
red/green del mapa de cabeceras del firmador productivo.
Regresiones Jest y dos casos HTTP localhost firmados B87
agregados; inventario completo **44 escenarios B86–B112**.

Comandos canónicos:
- `pnpm test:account-export-b112-signed-body-headers`
- `pnpm test:account-export-b107-release-acceptance`
  (Node24 obligatorio)
- `pnpm test:account-lifecycle-contract`

**Pendientes:** ejecución 44 escenarios TCP firmados
con adaptador real Node24/pnpm9, Jest/Nest, lint/typecheck,
Mongo replica B94, AWS/MinIO IAM/lifecycle, backups,
navegadores y auditorías #133/#141.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false` en
producción; sin CI manual ni despliegue.

## B113 — Estado HTTP exacto en los ACK de escritura S3

B113 elimina `response.ok` como evidencia suficiente de las
escrituras al almacenamiento. Cada `PutObject`, inicio multipart,
`UploadPart` y `CompleteMultipartUpload` exige **HTTP 200**;
el XML de finalización confirmado y el GET+SHA256 de B90 siguen
siendo obligatorios. `HTTP 202 Accepted` no demuestra persistencia,
`204` no es ACK de escritura y `206` no acredita una parte,
aunque incluya ETag.

Una respuesta ambigua detiene la generación del writer B104,
impide `complete()` y preserva el `uploadId` conocido para
abort owner-safe. `AbortMultipartUpload` confirma únicamente
con 200/204/404; un 202 no borra el ID y permite reintentar.
No eliminar directamente objetos privados con
`deleteObjectOnAbort:false`: la limpieza sigue B80/B81.

**Advertencia operativa:** un proveedor que haya iniciado multipart
pero conteste 202 deja un posible upload remoto de estado incierto.
Conservar una regla de lifecycle S3 para abortar subidas
multipart incompletas; no inventar ni confiar en un `uploadId`
no confirmado. Un PUT o Complete con 202 **podría** haber
persistido bytes; resolver mediante la generación registrada,
readback y cleanup owner-fenced.

**Evidencia:** 8/8 `node:test` nativos en Node22.16.0,
con helper y test B113 verificados por hash Git. Pruebas Jest
del adaptador y cinco escenarios HTTP localhost SigV4 B87
incorporados; inventario total **49 casos firmados B86–B113**,
pendientes de ejecución completa en Node24.

```sh
pnpm test:account-export-b113-write-ack
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

**No aprobado todavía:** 49 casos TCP firmados en checkout Node24,
Nest/Jest, typecheck/lint, Mongo replica B94, proveedor AWS/MinIO
con IAM/lifecycle y backups, navegador y auditorías #133/#141.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false`; no CI manual
ni despliegue.

## B114 — El GET S3 de objeto completo exige 200 y AbortError ante cancelación

En el adaptador, `readObjectChunks()` firmaba un GET sin Range, pero
aceptaba cualquier `response.ok`, incluso `HTTP 206 Partial Content`
o `202 Accepted`. B114 exige **200 exacto** para un objeto completo;
cancela la respuesta inválida antes de entregar bytes a scanners
o consumidores. Los GET de *prefijo* siguen admitiendo solo
200/206 estructuralmente válidos mediante B111.

Se refuerza el `AbortSignal`: una cancelación no puede terminar
como un EOF exitoso aunque `reader.read()` resuelva `done:true`.
La descarga abortada produce `AbortError` y libera el reader.
El readback SHA256 B90 y limpieza privada owner-fenced B80/B81
continúan intactos.

**Evidencia:** 7/7 pruebas nativas Node22.16.0 PASS con los
archivos cotejados por Git blob. Se incorporaron casos Jest
del adaptador y dos escenarios localhost SigV4 B87; inventario
firmado obligatorio: **51 pruebas B86–B114**, aún sin ejecutar
en Node24.

```sh
pnpm test:account-export-b114-full-get
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

**Pendiente:** 51 TCP SigV4 Node24/pnpm9, Jest/Nest, TypeScript,
Mongo B94, proveedor S3/MinIO IAM/lifecycle real, backup,
navegador y auditorías #133/#141.

**#353 HOLD** y `STUDY_PROGRESS_ENABLED=false` productivo;
no ejecutar CI manual ni desplegar.

## B115 — Verificación de Content-Length en GET completo S3

B114 ya exige HTTP 200 y abortos con `AbortError`, pero
`readObjectChunks()` no validaba que el cuerpo emitido tuviese
la longitud declarada por `Content-Length`. B115 incorpora
contabilidad de bytes en streaming: si hay cabecera, verifica
formato decimal canónico no negativo, límite de entero seguro,
rechaza antes de emitir un chunk que desborde la cifra y
requiere coincidencia exacta al EOF natural. EOF prematuro
o metadata inválida implica fallo y cancelación del reader.
El cierre intencional del consumidor no se confunde con EOF
del proveedor.

Sin Content-Length se conserva la lectura chunked de
proveedores compatibles; los hashes B90 son imprescindibles
para verificar integridad de exportaciones privadas. Esta
defensa no sustituye los controles de autorización B80/B81.

Evidencia: ocho callbacks nativos reproducidos sobre las
funciones reales en V8 aislado con tipos TS quitados (**8/8**);
cinco pruebas Jest del adaptador y dos escenarios TCP
firmados SigV4 B87 añadidos. El inventario ahora exige
**53 tests B86–B115** en Node24, sin omisiones.

```sh
pnpm test:account-export-b115-full-get-length
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

Todavía no fueron ejecutados los 53 escenarios firmados
reales del adaptador en checkout Node24/pnpm9, ni Jest,
typecheck/lint, Mongo B94, S3/MinIO real, backup/restore
o auditorías #133/#141.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false` en
producción; sin CI manual ni despliegue.

## B116 — S3 HEAD no confirma objetos mediante estados ambiguos

B116 cierra una brecha en `S3ObjectStorage.headObject()`. El
adaptador aceptaba `response.ok` y, por lo tanto, un HEAD
`202/204/206` con Content-Length plausible podía ser interpretado
como objeto existente. También aceptaba formatos ambiguos con
`Number(rawLength)`, como `01`, `8e2` o encabezado vacío.

Ahora solo `HTTP 200` confirma metadatos de objeto; el `404`
mantiene semántica de ausente. Content-Length tiene que ser decimal
canónico, no negativo y entero seguro. Los otros estados devuelven
error, sin habilitar finalización o publicación por el solo metadata
que afirmó el gateway. SigV4, ETag histórico, autorizaciones y
limpieza owner-fenced quedan inalterados.

Tests nativos y casos Jest documentados en
`docs/engineering/account-export-b116-head-contract.md`.

```sh
pnpm test:account-export-b116-head
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

Los **53 escenarios TCP firmados B86–B115** permanecen pendientes
de aceptación integral en Node24/pnpm9; B116 no los marca como
aprobados. También siguen pendientes Jest/Nest, Mongo B94,
S3/MinIO externo, backup/restore y auditorías #133/#141.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false` en producción;
sin CI manual ni despliegue.

## B117 — HEAD S3 contra TCP firmado y aceptación obligatoria

B116 reforzó la confirmación HEAD (únicamente HTTP 200 y tamaño
decimal canónico), pero ese contrato todavía carecía de prueba
de socket localhost firmada. La fixture B86/B87 incorpora ahora
respuestas HEAD servidas **después de validar SigV4 independientemente**.
Cuatro nuevos grupos de prueba cubren: (1) HEAD 200 con tamaño/ETag
y posterior 404, (2) HEAD 202/206 falsamente exitosos,
(3) HTTP 204 y HTTP 200 sin tamaño, (4) tamaños malformados,
duplicados y excesivos. Las pruebas negativas conservan el
objeto privado y verifican ausencia de DELETE.

El runner B107 exige ahora **57 casos HTTP firmados B86–B117**,
con inventario completo, checks anti-skips/TODO y runtime Node24.
Los guards históricos B104–B115 se actualizaron para no aceptar
un inventario anterior de 53 pruebas como si fuese completo.

```sh
pnpm test:account-export-b117-signed-head
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

El diagnóstico Node22, source guards, comparación de blobs y
test nativo aislado **no son** aceptación del runtime S3.
Los **57 casos HTTP firmados** requieren ejecución completa
en checkout Node24/pnpm9; pendientes también Jest/Nest,
Mongo B94 con réplica, AWS/MinIO IAM/lifecycle, backup/restore,
navegador, calidad global y auditorías #133/#141.

**#353 HOLD**; `STUDY_PROGRESS_ENABLED=false` productivo.
Sin CI manual ni despliegue.

## B118 — Evidencia local exact-head para HTTP S3 firmado

B117 dejó definidos **57 escenarios firmados**, pero no una
constancia persistente que relacione su ejecución con un commit exacto,
el inventario probado y el runtime Node24. B118 incorpora
`scripts/run-account-export-b118-local-proof.mjs`, ejecutable
localmente sobre un checkout Git limpio. No dispara CI ni despliegues.

Preflight: `--expected-sha` de 40 hex; Git HEAD exacto sin cambios
trackeados/no trackeados; Node24, pnpm 9.15.9, Study Progress no habilitado;
57 nombres distintos con 4 casos B117. Ejecuta el runner firmado
B101/B107 completo y exige su TAP 57/57 sin skips, failures ni TODO.
Vuelve a comprobar SHA/worktree/hashes de fuentes luego de ejecutar.
Solo ante prueba positiva crea JSON compacto en directorio temporal
privado con hashes SHA256 de inventario, runner y TAP; excluye secretos,
cuerpos HTTP, bytes privados, nombres de usuarios y credenciales.

```sh
pnpm test:account-export-b118-contract
node scripts/run-account-export-b118-local-proof.mjs --expected-sha=<COMMIT_SHA_DE_40_HEX>
```

**El agregado del ejecutor no significa que se hayan corrido 57
escenarios HTTP**. En este entorno Node22 se puede probar la lógica
pura pero no la aceptación Node24. Continúan pendientes Mongo
réplica B94, S3/MinIO externo y lifecycle IAM, browser, backup,
Jest/lint/typecheck, auditorías #133/#141. Un comprobante local firmado
no libera otros gates.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false` productivo.
Sin CI manual ni deployment.

## B119 — HEAD S3 valida ETag presente y mantiene ausencia opcional

El adapter `headObject()` retiraba comillas inicial/final con una
expresión regular permisiva, pudiendo devolver como metadata un
ETag `"unbalanced`, `unbalanced"` o con comillas internas tras HTTP
200 y tamaño correcto. B119 reutiliza el parser estricto B108
`normalizeS3MultipartPartEtag`: header presente malformado ahora falla
cerrado. La cabecera ausente sigue dando `etag: null`; los tokens
válidos multipart o S3 compatibles se preservan.

Nuevos tests nativos (5), Jest del adapter y 2 grupos HTTP TCP
localhost firmados, con verificación de ausencia de DELETE para
respuestas HEAD rechazadas. El inventario activo de aceptación es
ahora de **59 casos HTTP firmados**, obligatorio en Node24/pnpm9
sin skips/TODO. El launcher de comprobante B118 ya no puede aceptar
un histórico 57/57 como 59/59.

```sh
pnpm test:account-export-b119-head-etag
pnpm test:account-export-b119-signed-head
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

Los tests de helper y los guards de fuente no sustituyen la ejecución
integral de **59 casos HTTP** con el adaptador real en Node24.
Pendientes asimismo Jest/Nest, Mongo réplica B94, AWS/MinIO IAM y
lifecycle, backup/restore, navegador y auditorías #133/#141.
El ETag no reemplaza verificación SHA256 B90.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false` en producción.
Sin CI manual ni despliegue.

## B120 — DeleteObject privado exige confirmación terminal

El adaptador S3 `deleteObject()` ya no trata el `response.ok` HTTP 2xx
como prueba de eliminación. Para cerrar correctamente el ciclo
owner-fenced B78–B81, ahora **solo 204, 200 compatible y 404
idempotente** son terminales. Respuestas `202 Accepted`, `206
Partial Content` y otros 2xx ambiguos originan error, sin retry
automático ni eliminación adicional. Un proveedor podría haber
borrado o conservar el objeto: no se declara éxito sin ACK terminal.

B120 añade 5 pruebas nativas de estados (Node22 aislado **5/5
PASS**, hashes de ambos archivos cotejados con Git), regresiones
Jest del adapter y 2 grupos de escenarios HTTP localhost firmados
que ejercitan ambos destinos de una respuesta de borrado ambigua.
La batería Node24 de aceptación ahora exige **61 casos HTTP
firmados**, y la evidencia exact-head B118 exige `61/61` en lugar de
`59/59`; sin skips/TODO ni pruebas omitidas.

```sh
pnpm test:account-export-b120-delete
pnpm test:account-export-b120-signed-delete
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

Aún **no** se ejecutó la suite completa de 61 HTTP firmados en
Node24; los 5/5 nativos Node22 son evidencia limitada. Restan
Jest/Nest, Mongo réplica B94, S3/MinIO con IAM/lifecycle,
backup/restore, navegación y auditorías #133/#141.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false` productivo,
sin CI manual ni despliegue.

## B121 — Ejecución efectiva Node24 de 61 casos TCP firmados

El PR #442 agregó el job **read-only** `B121 Node24 signed S3 HTTP acceptance`
sobre HEAD exacto del PR, sin secrets S3, sin Mongo externo,
sin despliegues y con `STUDY_PROGRESS_ENABLED=false`. La
primera ejecución real descubrió cuatro expectativas de tests
incorrectas (3 comparaciones Buffer vs Uint8Array con bytes
idénticos y 1 firma multipart con Content-Type efectivamente firmado).
Se corrigieron conservando las comprobaciones de bytes/SigV4.

La segunda corrida ejecutó **61/61 casos PASS** pero el wrapper de
release correctamente rechazó la salida spec de Node24 por no ser TAP.
B121 fijó `--test-reporter=tap` y reforzó el guard B107 para prevenir
la regresión.

**Evidencia real Node24, GitHub Actions #39147403904**:
- `TAP version 13`, plan `1..61`.
- `61/61 PASS`, **0 failures, 0 skips, 0 TODO, 0 cancelled**.
- `B107 Node24 qualified signed HTTP PASS: 61/61`.
- HEAD Git exacto antes/después, runner local firmado y 127.0.0.1.
- No es aceptación de S3 AWS/MinIO externo ni de release.

El control de aceptación aislado está en
`.github/workflows/b121-signed-http-node24.yml`; se activa
automáticamente en PRs pertinentes y carece de permisos de escritura,
`workflow_dispatch`, claves cloud y pasos de despliegue.

Pendientes en **#353 HOLD**: Jest/Nest/API lint y typecheck,
Mongo réplica B94, proveedor S3 real IAM/lifecycle,
backup/restore, navegadores, calidad global y auditorías #133/#141.
`STUDY_PROGRESS_ENABLED=false` en producción.

## B122 — MongoDB réplica real con cinco casos de recuperación privada

Se añadió el workflow de solo lectura
`.github/workflows/b122-mongo-replica-acceptance.yml`
para ejecutar el **runner B94 ya existente** sobre un MongoDB 7
desechable, réplica `rs0` con primaria real en
`127.0.0.1:27017`, Node24 y dependencias frozen lockfile.
El job verifica checkout Git exacto antes/después, inicia un
primario validado, y destruye siempre el contenedor. No usa
Mongo remoto, autenticación de producción, IAM S3, flags activas,
`workflow_dispatch` ni despliegue.

**Evidencia ejecutada:** PR #443,
[GitHub Actions #39149219803](https://github.com/Enzopinotti/losApuntes/actions/runs/39149219803),
job `SUCCESS`, cinco aserciones Jest B86/B90/B93
**5/5 PASS**. El archivo contenía 56 tests; **51 se omitieron
intencionalmente por estar fuera del filtro B94**, no se atribuyen
como ejecutados. El reporte estricto B94 confirmó:
`B94 local Mongo/S3 acceptance PASS: 5/5 mandatory cases executed.`.

El alcance es recuperación owner-fenced y autoridad del reloj
Mongo con S3 simulado dentro de Jest. **No** prueba S3
AWS/MinIO externo; B121 conserva evidencia independiente
de 61/61 HTTP S3 firmados con fixture localhost. Quedan
pendientes chequeos de calidad completos (CI `verify`),
integración multiusuario navegador, proveedor S3 externo
IAM/lifecycle y restore, y auditorías #133/#141.

**#353 HOLD**, `STUDY_PROGRESS_ENABLED=false` en producción.
