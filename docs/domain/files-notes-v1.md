# Files + Notes v1 — implementation contract

**Issue:** #6  
**Status:** Implemented candidate — pending exact-head merge verification  
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
- state = `pending | scan_pending | scanning | ready | rejected | failed | reclaiming | reclaimed`;
- failureCode for rejected/failed/retryable safety states;
- expiresAt while reclaimable;
- readyAt only after a clean safety scan;
- bounded safety-scan evidence: attempts, lease/claim metadata, completedAt and scanner engine;
- createdAt / updatedAt.

### Resource

Resource is the product object and, for the current v1 one-to-one model, the
product lifecycle authority that retains its claimed FileAsset. The FileAsset
creator and Resource author remain attribution/provenance; neither field alone
makes claimed bytes purgeable.

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

- `POST /files/upload-intents` — authenticated + verified email; validates policy and creates pending asset + signed PUT.
- `POST /files/:fileId/finalize` — authenticated + verified email creator only; verifies storage metadata/signature, quarantines the asset and returns `ready` only after clean safety-scan evidence.
- Files object keys are never returned.
- No generic public download-by-file-id endpoint exists.

### Resources

- `POST /resources` — authenticated + verified email; consumes one ready, clean-scanned owned asset and canonical academic context.
- `GET /resources/:id` — current viewer projection; anonymous only when public.
- `PATCH /resources/:id` — verified author only + expectedRevision.
- `POST /resources/:id/access` — authenticated + verified email; reauthorizes then returns short-lived signed GET for inline/attachment disposition.
- `PUT /resources/:id/shares/:profileId` — verified author only; resolves the stable public Profile UUID to the account authority.
- `DELETE /resources/:id/shares/:profileId` — verified author only.
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
| signed read | yes, verified session | yes, verified session | no | yes for a public Resource with verified session |
| edit/privacy | yes | no | no | no |
| manage shares | yes | no | no | no |
| save | yes | yes | n/a | public authenticated viewer |
| report | yes | yes | n/a | public authenticated viewer |

`hidden` resources fail closed for normal readers. Public metadata may be read anonymously, but file delivery is intentionally stricter: issuing a signed preview/download requires an active verified account plus current Resource read authorization. Administrative moderation access is not invented in this slice.

## 5. Concurrency/idempotency

- Upload intent creates one immutable object key.
- Signed PUT must not be a replacement path and binds the exact declared byte length, so a modified client cannot use a valid intent to stream an arbitrarily larger object.
- Finalize verifies uploaded bytes, then stages `pending -> scan_pending`; a scan claim uses a unique lease-bound claim id so a stale worker cannot publish a later result.
- Only a clean scan may transition `scanning -> ready`; scanner outage reschedules bounded retry, malicious verdict transitions to `rejected`, and retry exhaustion fails closed.
- Legacy `ready` assets without scan evidence are treated as untrusted and re-enter scanning before they are shareable.
- Resource creation claims a `ready` asset only when `scanCompletedAt + scanEngine` evidence exists. One asset cannot back two unrelated Resources in v1.
- cleanup first claims an expired **unclaimed** asset into `reclaiming`; only then may it delete object bytes. This makes abandoned-upload cleanup mutually exclusive with Resource claiming.
- a claimed FileAsset is retained by its Resource lifecycle. Closing the creator account, archiving an Organization, removing a save/share, or losing a reference does not release that claim.
- current persistence is intentionally one Resource ↔ one claimed FileAsset: `Resource.assetId` and non-null `FileAsset.claimRef` are unique. Do not introduce a speculative refcount unless a future feature changes that cardinality.
- future Resource purge must define an explicit claim-release transition plus retention/audit/backup semantics before live object deletion is allowed.
- Resource mutations use `expectedRevision`.
- Share/save uniqueness is enforced in persistence, not only by controller prechecks.
- Cross-user resource/file probes use opaque not-found behavior where existence disclosure is unnecessary.

## 6. Validation

- title, description and tags are length-bounded;
- tags are normalized/deduplicated;
- MIME is allowlisted and signature-verified;
- declared size is bound into the signed PUT and expected size must still exactly equal object-storage HEAD at finalize;
- subject must resolve to an active canonical Subject;
- optional CourseOffering must be a descendant of that Subject;
- signed-read filename is response metadata only and sanitized before Content-Disposition.

## 7. Runtime

Local/CI runtime includes:

- Mongo replica set;
- Mailpit;
- private RustFS S3-compatible API;
- bucket bootstrap;
- API;
- dedicated Files worker for safety-scan retry/recovery plus expired-byte cleanup;
- deterministic inert quarantine scanner only for local/CI runtime.

RustFS Console is disabled in the application runtime and must not become product ingress.

Production readiness later requires a dedicated HTTPS presign origin/CORS review and a real reviewed safety-scanner deployment (the repository includes a provider-neutral contract plus ClamAV INSTREAM adapter). The deterministic local scanner is test evidence only and is rejected by non-local production configuration.

## 8. Web product surface

The Web route `/resources` is anonymous-readable for discovery and uses the same server authorization projection as other clients.

Authenticated users can:

- search canonical Subjects from Academic Graph before publishing;
- request an upload intent;
- upload bytes directly to the signed storage URL with progress and cancellation;
- finalize and publish the Resource;
- choose private/shared/public visibility;
- request preview/download only after server reauthorization;
- save accessible resources;
- report resources;
- change privacy when server capabilities identify them as the author;
- grant/revoke explicit sharing by public Profile UUID.

The browser does not store bearer credentials or object keys. API metadata calls use the existing HttpOnly cookie with `credentials: include` and `no-store`. The direct signed PUT deliberately does **not** send application cookies.

The first-page bounded discovery UI is intentionally metadata search, not OCR/full-text search. Search engine/OCR evolution remains a projection concern, not a Resource identity change.

## 9. Verification required before merge

Permanent CI must prove on the exact final HEAD:

- repository quality gate;
- Auth critical coverage;
- Academic critical coverage;
- Profile critical coverage;
- Files/Resources critical coverage;
- production dependency audit;
- real S3-compatible lifecycle against RustFS;
- container runtime smoke;
- cross-user privacy negatives;
- privacy transition revokes future signed issuance;
- duplicate finalize/retry does not duplicate Resource/File state;
- abandoned upload cleanup deletes object bytes and metadata lifecycle advances safely;
- quarantine rejection cannot be claimed by a Resource and rejected bytes are deleted best effort;
- scanner outage/retry and stale scan ownership fail closed.

No earlier-SHA green result counts as merge evidence.

## 10. Honest v1 boundaries

Files + Notes v1 does not invent hard Resource deletion or tombstoning semantics. `DELETE-01` in the 2026 domain contract explicitly leaves anonymize/tombstone/retention/physical-delete behavior to the DER and data-retention policy. V1 therefore closes publication/privacy/access lifecycle without pretending that irreversible deletion policy has already been decided.

ADR 0007 narrows one prerequisite without inventing deletion: claimed bytes are
retained by the Resource relationship; creator/author identity and Organization
references do not own byte deletion; the current 1:1 model needs no refcount.
A future destructive carrier must first define how the Resource releases its
claim and how retention/backups affect physical erasure.

Native Mobile screen acceptance and production HTTPS/presign-origin/CORS evidence also remain outside this slice and are owned by their existing readiness lanes.
