# B86 — Real HTTP loopback S3 fault injection + isolated Mongo recovery acceptance

**Base:** B85 `main@303b53b5381661bf049f83537d9a68eac2b58f56`.  
**Release:** #353 **OPEN/HOLD**; `STUDY_PROGRESS_ENABLED=false`. No manual CI or deployment.

## Objective

B78–B85 established durable generation-specific Mongo authority, S3 multipart-only abort, server-clock claim expiration and retention fences. However the acceptance evidence was split between Mongo replica-set tests with **fake artifact adapters** and S3 adapter tests with **mocked `fetch`**. B86 joins the pieces and exercises the real S3 signed HTTP code, while still ensuring local-only test scope.

## Level A — executable real localhost HTTP (no Mongo, no external S3)

`scripts/test-account-export-b86-s3-loopback.test.mjs` spins up an ephemeral `node:http` server **only on 127.0.0.1** and configures the real `createS3ObjectStorage` (SigV4 signing, real `fetch`, real TCP/HTTP) with **fixture-only credentials** and a single exact `exports/<job-uuid>/<generation-uuid>.json` path. The server implements only the small S3 subset needed for fault injection; it is **NOT** S3/MinIO and does not test bucket IAM, versioning, multipart semantics across regions or vendor behavior.

Five tests:
1. Genuine HTTP signed `PUT → GET streaming → DELETE` round trip; compare SHA-256 of readback bytes and enforce path + auth/date headers.
2. **Single PUT acknowledged internally but HTTP ACK lost:** committed bytes remain after private writer `abort()`. Explicit object DELETE receives **503** first (object must survive), then succeeds on retry.
3. **Multipart completion internally committed but HTTP ACK lost:** the writer can only send AbortMultipartUpload **with uploadId**, not a naked `DELETE Object`. Explicit deletion remains separate.
4. Unfinished private multipart abort deletes only the upload ID. No object-level DELETE.
5. Shared/general S3 writer retains prior default abort behavior so unrelated file flows do not regress.

## Level B — opt-in real Mongo + real app S3 adapter + mocked HTTP transport

Two new tests in `study-progress.mongo-int.spec.ts` reuse its explicit, isolated, disposable **local Mongo replica-set** connection, models, indexes and teardown; the test owns its fake S3 response transport and never requests a remote object-storage endpoint:

- **Lost single PUT ACK + B80 first-claim writeahead + B82 revocation + 503 S3 deletion + durable retry + eventual queue ACK**: persist a pending v1 job, claim it transactionally, verify the orphan intent exists **before** the S3 writer starts, write real exported bytes with `S3AccountExportArtifactStorage`, simulate a provider-committed PUT with lost reply and private abort with zero inline DELETE. In this isolated DB, advance persisted lease/settlement/horizon to expired. Run the actual `AccountExportProcessor` + both actual Mongo stores: first DELETE returns 503, queue remains and job is pending; retry after making the durable task due returns 204, object deleted, queue ACKed and no published reference.
- **Completed generation remains published**: the real S3 writer succeeds, actual Mongo job completes, its B80 queue intent is made due in the isolated database, and the real cleanup processor **ACKs the task without issuing any DELETE**. The completed job retains its artifactGeneration and the object bytes remain.

**Scope distinction:** these tests exercise the real persistence authority in Mongo and the real signed S3 adapter, but S3 responses are simulated through `jest.spyOn(globalThis, 'fetch')`. They are **not** evidence of successful integration with a real S3 provider or real network fault behavior. Run Level A and Level B separately.

## Reproducible commands

Level A needs Node 24 (project engine), no pnpm/Mongo:

```bash
node --experimental-strip-types --test scripts/test-account-export-b86-s3-loopback.test.mjs
```

Level B **requires explicit operator opt-in** to a disposable local MongoDB replica set already running, and Node24/pnpm9 with project dependencies installed. Do not point at development/staging/production data. The existing Mongo spec protects with a unique disposable DB and validates replica topology before any writes. Runner prevents silent zero-test/skipped acceptance and refuses nonlocal or credentialed URIs:

```bash
STUDY_PROGRESS_ENABLED=false \
STUDY_PROGRESS_TEST_MONGO_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' \
node scripts/run-account-export-b86-local-acceptance.mjs
```

Also run `node scripts/test-account-export-b86-guard.mjs` (source contract) and exact-HEAD `pnpm --filter @losapuntes/api check:types` plus Jest/format/lint and real S3 acceptance before any release. The opt-in runner does **not** start containers, bypass the project's release gate, enable a feature flag or alter any external S3 bucket.

## Release and known gaps

Local HTTP simulation is more realistic than pure `fetch` mocks, and Level B connects real Mongo authority to the real object adapter, but it does **not** establish AWS/MinIO/provider semantics, IAM allowlist, noncurrent-version deletion, multi-hour late multipart resurrection, lifecycle/backup/restore or disaster recovery. Actual Node24 full Jest/TypeScript, browser/HTTP acceptance, provider readback and audits #133/#141 remain mandatory. **Do not mark #353 PASS.**

## Concurrent lanes

#349/#377/#383/#385/#386/#387/#388/#390/#391/#393/#396 overlap formatting or test snapshots. Rebase exact current `main` before merging and retain the two B86 Mongo scenarios, B80/B82 protections and the B86 loopback test + explicit runner. No manual CI trigger.
