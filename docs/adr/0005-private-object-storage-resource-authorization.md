# ADR 0005 — Private object storage and resource-owned authorization

**Status:** Accepted for Files + Notes v1  
**Date:** 2026-09-23

## Context

Los Apuntes needs direct browser/mobile uploads, preview/download and future reuse of binary storage without turning object-storage identifiers into authorization.

The 2026 domain contract already requires:

- Resource and ResourceAsset to remain separate;
- object key/file id/signed URL never to grant product access;
- every read/download issuance to be authorized from current product state;
- abandoned uploads not to create valid Resources;
- privacy transitions to affect future access immediately;
- retry/finalization to be idempotent.

The current application has no object-storage runtime. MongoDB remains a replaceable transactional adapter under ADR 0004.

## Decision

Introduce two boundaries.

### Files platform boundary

`files` owns byte lifecycle only:

```text
pending FileAsset
-> short-lived signed PUT
-> private S3-compatible object storage
-> finalize HEAD + prefix/MIME verification
-> ready | failed
-> bounded signed GET only after an owning domain authorizes it
```

The storage adapter is S3-compatible. Local/CI uses private MinIO. Production may use AWS S3 or another compatible provider without changing Resource semantics.

The Files domain depends on an `ObjectStorage` port, not provider SDK types outside the adapter.

### Resources / Notes boundary

`resources` owns:

- Resource identity and author;
- title/description/tags;
- stable Academic Graph context;
- visibility and explicit share grants;
- moderation availability state;
- save/bookmark relationships;
- search/read authorization;
- report relationships;
- the relationship to one ready FileAsset in v1.

A file is never readable merely because its id/object key is known.

## V1 upload policy

V1 accepts:

- `application/pdf`;
- `image/jpeg`;
- `image/png`;
- `image/webp`.

Maximum object size: **50 MiB**.

Upload intent TTL: **10 minutes**.  
Download/preview intent TTL: **5 minutes by default**, runtime-bounded to **1–300 seconds**. Local/CI intentionally uses 2 seconds so expiry is proven against real MinIO rather than only asserted from configuration.

The upload URL is single-object and signed with immutable-create semantics. The signature binds the declared `Content-Type` and exact `Content-Length` as well as the create-only condition, so object storage rejects replacement attempts and wrong-sized request bodies before they become valid uploads. Finalization independently re-verifies object existence, exact size, stored Content-Type and a bounded byte prefix against the supported MIME signature.

Storage mismatch fails closed and the object is deleted best-effort.

## V1 privacy

Resource visibility is one of:

- `private`: author only;
- `shared`: author plus explicit user grants;
- `public`: anonymously readable unless moderated/removed.

There is no possession-based “secret link grants access” in v1. A future share-link feature requires its own opaque-token lifecycle, revocation and expiry contract.

Changing visibility or removing a share affects all **future** signed-read issuance immediately. Already-issued URLs are bounded by the short download TTL.

## Cleanup

API instances do not run per-process cleanup timers.

A dedicated Files cleanup worker reclaims expired unclaimed assets in bounded batches.

Cleanup uses a durable compare-and-set transition before touching bytes:

```text
pending | failed | ready(unclaimed)
-> reclaiming
-> DELETE object bytes
-> reclaimed
```

The `reclaiming` claim happens before object deletion. Resource creation only claims `ready` assets, so a Resource cannot race with cleanup and become attached to bytes that the worker is deleting. If object deletion fails, `reclaiming` remains durable and retryable on a later worker pass.

Durable ready assets already claimed by Resources are never reclaimed as abandoned uploads.

## Search

V1 search is a bounded transactional read model over Resource metadata and academic context. It does not claim OCR/full-text extraction, vector search or a dedicated search engine.

Search/indexing can later become a separate projection without changing Resource identity or authorization.

## Consequences

### Positive

- browser/mobile bytes bypass API payload buffering;
- provider credentials remain server-side;
- storage remains reusable;
- Resource privacy remains authoritative;
- direct uploads are retryable and idempotent;
- DER reconciliation can change physical persistence without changing product semantics.

### Costs

- object storage becomes an explicit runtime dependency for upload/download;
- local/CI needs MinIO;
- production needs a reviewed public presign origin, TLS and storage CORS;
- cleanup worker becomes a required operational component.

## Rejected alternatives

### Public bucket URLs

Rejected. They make delivery location behave like authorization and break privacy revocation.

### Uploading file bytes through Nest

Rejected for normal resource uploads. It unnecessarily couples API memory/bandwidth to file size and makes mobile retry/progress worse.

### Storing blobs in MongoDB

Rejected. Mongo remains transactional metadata persistence, not binary object storage.

### Resource id == storage object key

Rejected. Resource lifecycle and asset lifecycle are distinct and may evolve independently.

### Provider-specific authorization

Rejected. S3/MinIO decides whether a signed storage request is valid; Los Apuntes decides whether a user may receive that signed request.
