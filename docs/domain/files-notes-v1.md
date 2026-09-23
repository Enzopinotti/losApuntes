# Files + Notes v1 — implementation contract

**Issue:** #6  
**Status:** In implementation  
**Authority:** 2026 domain contract + ADR 0005

## 1. Product outcome

A verified Los Apuntes account can upload a note/resource directly to private object storage, finalize it safely, attach it to canonical academic context, control privacy, preview/download it, save accessible resources, discover resources through bounded search and report problematic content.

The module is mobile-safe by contract even before native UI acceptance: intent/finalize are retryable, bytes upload directly, signed URLs are short-lived and no product authority lives in client storage.

## 2. Domain model

### FileAsset

FileAsset represents an upload lifecycle, not a public Resource.

Core fields:

- stable UUID;
- creatorUserId;
- purpose = `resource-asset`;
- provider id;
- private objectKey;
- originalFilename;
- declaredMimeType;
- verifiedMimeType when ready;
- expectedByteSize;
- actualByteSize when ready;
- ETag when available;
- state = `pending | ready | failed`;
- failureCode when failed;
- expiresAt while reclaimable;
- readyAt;
- createdAt / updatedAt.

### Resource

Resource is the product object.

Core fields:

- stable UUID;
- authorUserId;
- activeAssetId;
- title;
- optional description;
- bounded normalized tags;
- subjectId;
- optional courseOfferingId;
- visibility = `private | shared | public`;
- moderationState = `available | hidden`;
- revision for optimistic writes;
- createdAt / updatedAt.

Academic context is validated through Academic Graph. A Resource cannot use free-text university/career/materia as canonical authority.

### ResourceShare

Explicit `resourceId + userId` grant.

A share never changes ownership and never grants mutation authority.

### ResourceSave

Unique `userId + resourceId` relation.

Saving never grants access. Saved-list reads reauthorize current Resource visibility.

### ResourceReport

Reporter-attributed report with bounded reason:

- spam;
- plagiarism;
- copyright;
- honor_code;
- inappropriate;
- other.

V1 creates durable pending reports. Moderation resolution/queue belongs to the later moderation slice; reporting itself is real and duplicate-open reports are rejected/idempotent by store authority.

## 3. HTTP contract

### Files

- `POST /files/upload-intents` — authenticated; validates policy and creates pending asset + signed PUT.
- `POST /files/:fileId/finalize` — authenticated creator only; idempotent ready result.
- Files object keys are never returned.
- No generic public download-by-file-id endpoint exists.

### Resources

- `POST /resources` — authenticated; consumes one ready owned asset and canonical academic context.
- `GET /resources/:id` — current viewer projection; anonymous only when public.
- `PATCH /resources/:id` — author only + expectedRevision.
- `POST /resources/:id/access` — reauthorizes then returns short-lived signed GET for inline/attachment disposition.
- `PUT /resources/:id/shares/:userId` — author only.
- `DELETE /resources/:id/shares/:userId` — author only.
- `PUT /resources/:id/save` / `DELETE /resources/:id/save` — authenticated viewer.
- `GET /resources/saved` — authenticated; inaccessible saved resources are omitted.
- `GET /resources` — bounded search/filter; anonymous sees public only, authenticated viewer additionally sees owned/shared.
- `POST /resources/:id/reports` — authenticated viewer with current access.

## 4. Authorization matrix

| Operation | Author | Explicit share | Public anonymous | Other |
| --- | --- | --- | --- | --- |
| metadata read, private | yes | no | no | no |
| metadata read, shared | yes | yes | no | no |
| metadata read, public | yes | yes | yes | yes |
| signed read | same as metadata read | same | same | same |
| edit/privacy | yes | no | no | no |
| manage shares | yes | no | no | no |
| save | yes | yes | n/a | public authenticated viewer |
| report | yes | yes | n/a | public authenticated viewer |

`hidden` resources fail closed for normal readers. Administrative moderation access is not invented in this slice.

## 5. Concurrency/idempotency

- Upload intent creates one immutable object key.
- Signed PUT must not be a replacement path.
- Finalize `pending -> ready` is compare-and-set and idempotently returns the already-ready asset for the same creator.
- Resource creation claims a ready asset once. One asset cannot back two unrelated Resources in v1.
- Resource mutations use `expectedRevision`.
- Share/save uniqueness is enforced in persistence, not only by controller prechecks.
- Cross-user resource/file probes use opaque not-found behavior where existence disclosure is unnecessary.

## 6. Validation

- title, description and tags are length-bounded;
- tags are normalized/deduplicated;
- MIME is allowlisted and signature-verified;
- expected size must exactly equal object-storage HEAD;
- subject must resolve to an active canonical Subject;
- optional CourseOffering must be a descendant of that Subject;
- signed-read filename is response metadata only and sanitized before Content-Disposition.

## 7. Runtime

Local/CI runtime includes:

- Mongo replica set;
- Mailpit;
- private MinIO S3 API;
- bucket bootstrap;
- API;
- dedicated Files cleanup worker.

MinIO Console is not required by application runtime and must not become product ingress.

Production readiness later requires a dedicated HTTPS presign origin/CORS review. Local HTTP is development evidence only.

## 8. Verification required before merge

Permanent CI must prove on the exact final HEAD:

- repository quality gate;
- Auth critical coverage;
- Academic critical coverage;
- Profile critical coverage;
- Files/Resources critical coverage;
- production dependency audit;
- real S3-compatible lifecycle against MinIO;
- container runtime smoke;
- cross-user privacy negatives;
- privacy transition revokes future signed issuance;
- duplicate finalize/retry does not duplicate Resource/File state;
- abandoned upload cleanup deletes object bytes and metadata lifecycle advances safely.

No earlier-SHA green result counts as merge evidence.
