# Files + Notes v1 — completion matrix

**Issue:** #6  
**Status:** Candidate pending exact-head and post-merge verification

| Capability | API/domain | Web | Permanent evidence |
| --- | --- | --- | --- |
| Resource/FileAsset separation | Implemented | Respected | ADR + unit |
| Private S3-compatible storage boundary | Implemented | Direct PUT only | MinIO runtime |
| Immutable upload intent | Implemented | Implemented | Unit + runtime |
| Verified-email upload/finalize | Implemented | Error surfaced | Auth/runtime |
| 50 MiB + MIME allowlist | Implemented | Prevalidated | DTO + unit |
| Byte-signature verification | Implemented | Server authority | Unit + runtime |
| Exact size/Content-Type verification | Implemented | Server authority | Unit + runtime |
| Finalize idempotency | Implemented | Safe retry | Unit + runtime |
| Single asset claim | Transactional | N/A | Runtime |
| Cleanup claim-before-delete | CAS `reclaiming` | N/A | Unit + worker runtime |
| Cleanup retry after storage failure | Durable | N/A | Unit |
| Public/private/shared metadata | Implemented | Implemented | Unit + runtime |
| Resource-scoped explicit grants | Implemented | Profile UUID controls | Adapter unit + runtime |
| Stale grants powerless after private transition | Implemented | Server-authorized | Adapter unit |
| Save never grants access | Implemented | Guardados view | Unit + runtime |
| Optimistic Resource revision | Implemented | Conflict surfaced | Unit |
| Canonical Subject context | Academic Graph authority | Subject picker | Unit + build |
| Optional CourseOffering validation | Academic Graph authority | Contract-ready | Unit |
| Metadata discovery/search | Bounded cursor API | Search/filter UI | Unit + build |
| Preview/download issuance | Reauthorized signed GET | Implemented | Runtime |
| Real signed URL expiry | Runtime bounded 1–300s | Ephemeral URL | MinIO smoke |
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
| Full container lifecycle | Mongo + Mailpit + MinIO + worker | API contract | CI |

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
- production HTTPS/presign-origin evidence.

Those are separate future concerns and must not be inferred from this module.

## Closure rule

Issue #6 closes only after one exact PR HEAD and the merged `main` both pass:

- Quality Gate;
- Auth critical coverage;
- Academic critical coverage;
- Profile critical coverage;
- Files Resources critical coverage;
- Production dependency audit;
- Container runtime smoke including real MinIO and cleanup worker.

Closure evidence records candidate SHA/run, merge SHA and post-merge run. No earlier-SHA green result counts.
