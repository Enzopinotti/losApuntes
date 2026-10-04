# Files + Notes v1 — completion matrix

**Issue:** #6  
**Status:** Closed — exact-head and post-merge verification complete

| Capability | API/domain | Web | Permanent evidence |
| --- | --- | --- | --- |
| Resource/FileAsset separation | Implemented | Respected | ADR + unit |
| Private S3-compatible storage boundary | Implemented | Direct PUT only | RustFS runtime (current) |
| Immutable upload intent | Implemented | Implemented | Unit + runtime |
| Verified-email upload/finalize | Implemented | Error surfaced | Auth/runtime |
| 50 MiB + MIME allowlist | Implemented | Prevalidated | DTO + unit |
| Signed exact byte-length bound | Implemented | User-agent Content-Length | Unit + RustFS runtime (current) |
| Byte-signature verification | Implemented | Server authority | Unit + runtime |
| Exact size/Content-Type re-verification | Implemented | Server authority | Unit + runtime |
| Provider-neutral safety scanner contract | Implemented | No client authority | Unit + build |
| Quarantine before shareability | Implemented | Fail-closed | Unit + runtime |
| Lease/claim fencing for scan workers | Implemented | N/A | Unit |
| Scanner outage bounded retry | Implemented | Retry/pending state | Unit |
| Rejected asset cannot publish | Implemented | Error surfaced | Unit + runtime |
| Rejected object byte cleanup | Best effort + durable state | N/A | Unit + runtime |
| Legacy ready asset re-scan | Fail-closed migration path | N/A | Unit |
| Finalize idempotency | Implemented | Safe retry | Unit + runtime |
| Single asset claim | Transactional | N/A | Runtime |
| Cleanup claim-before-delete | CAS `reclaiming` | N/A | Unit + worker runtime |
| Cleanup retry after storage failure | Durable | N/A | Unit |
| Losing pending→failed race never deletes ready bytes | Implemented | N/A | Unit regression |
| Public/private/shared metadata | Implemented | Implemented | Unit + runtime |
| Resource-scoped explicit grants | Implemented | Profile UUID controls | Adapter unit + runtime |
| Stale grants powerless after privacy exit | Implemented + atomically cleared | Server-authorized | Adapter unit + runtime |
| Returning to shared does not revive old grants | Implemented | No client authority | Runtime |
| Share lookup cannot authorize a different Resource | Implemented | No client authority | Adapter regression + runtime |
| Save never grants access | Implemented | Guardados view | Unit + runtime |
| Remove saved relation in place | Implemented | Implemented | Web static contract |
| Optimistic Resource revision | Implemented | Conflict surfaced | Unit |
| Canonical Subject context | Academic Graph authority | Subject picker | Unit + build |
| Merged Subject search filters | Canonicalized before query | Transparent | Unit |
| Optional CourseOffering validation | Academic Graph authority | Contract-ready | Unit |
| Metadata discovery/search | Bounded cursor API | Search/filter UI | Unit + build |
| Preview/download issuance | Reauthorized signed GET | Implemented | Runtime |
| Real signed URL expiry | Runtime bounded 1–300s | Ephemeral URL | RustFS smoke (current) |
| No objectKey/public bucket authority | Enforced | Never consumed | Static + runtime |
| Reports | Durable/idempotent pending | Implemented | Unit + runtime |
| Hidden moderation fail-closed | Implemented | Server projection | Unit |
| Upload progress | N/A | XHR progress | Static contract |
| Upload cancellation | N/A | AbortController | Static contract |
| Retry after failed upload | New immutable intent | Form preserved/resubmit | Contract |
| Browser bearer storage | Forbidden | None | Static contract |
| Storage cookies/credentials | Forbidden | XHR does not send app credentials | Static contract |
| Dedicated critical coverage | Enforced | N/A | CI |
| Production dependency audit | Enforced | N/A | CI |
| Full container lifecycle | Mongo + Mailpit + RustFS + scan/cleanup worker | API contract | CI |
| Local/CI quarantine scanner | Inert deterministic marker only | N/A | Unit + runtime |
| Production scanner adapter | ClamAV INSTREAM adapter | N/A | Source/build; deployment evidence external |

## Honest limitations

Files + Notes v1 does **not** claim:

- OCR or extracted full-text search;
- vector/semantic search;
- Office/video ingestion;
- historical ResourceAsset version chains;
- coauthor workflows;
- secret possession-based share links;
- moderation resolution UI;
- native Mobile screen acceptance;
- production HTTPS/presign-origin evidence;
- production ClamAV (or reviewed equivalent) deployment/connectivity/capacity evidence;
- hard Resource deletion/tombstoning semantics, which remain a `DELETE-01` / DER data-policy decision.

Those are separate future concerns and must not be inferred from this module.

## Native Mobile upload slice — tracked in #7

The native Create tab now has a repository implementation candidate for the same Files/Resources boundary:

- system file picker for PDF, JPEG, PNG and WebP, capped at 50 MiB;
- upload intents use a per-selection UUID operation key;
- binary PUT uses only the short-lived signed URL and the exact server-provided headers; app bearer/cookie headers are rejected at this boundary;
- progress, cancellation, and retry resume from the last completed upload stage;
- finalize remains server-authoritative, and resource creation starts private;
- publishing selects from the session's server-loaded academic participation list; the API re-resolves the canonical Subject and optional CourseOffering;
- an uncertain resource-create response blocks an immediate duplicate attempt for that selected file.

Local Mobile tests cover the staged intent → PUT → finalize → create sequence, retry/idempotency behavior, ambiguous create results, file policy, storage URL policy, and authenticated API authority. This code does not claim real-device screen acceptance; physical iOS/Android validation and the full #7 product journey remain open under #7.

The native picker lifecycle tracks the iOS temporary copy and releases it on replacement, removal, successful upload, stale picker completion, session change, and screen disposal. Cleanup waits for an active upload to settle after cancellation. Android's provider-owned `content://` URI is never deleted by the app. Unit tests cover release ordering, idempotency, and Android URI preservation; no device-level lifecycle evidence is claimed.

## Closure evidence

Files + Notes v1 is closed with exact evidence:

- candidate SHA: `64da3f6009fa15126eadc9ce80f726856f243eab`;
- candidate verify: run #478 / Actions `35866348177`;
- merge/main SHA: `112d07a8cd0b5a5d45bc231d0253cdc1572af5e3`;
- post-merge verify: run #479 / Actions `35868180682`.

Both candidate and merged `main` passed:

- Quality Gate;
- Auth critical coverage;
- Academic critical coverage;
- Profile critical coverage;
- Files Resources critical coverage;
- Production dependency audit;
- Container runtime smoke including the real S3-compatible object-storage backend and cleanup worker. The original closure runs used MinIO; current CI uses RustFS after MinIO CE image distribution became unavailable.

Issue #6 is closed. No earlier-SHA green result is used as closure evidence.
