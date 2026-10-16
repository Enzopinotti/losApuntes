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
