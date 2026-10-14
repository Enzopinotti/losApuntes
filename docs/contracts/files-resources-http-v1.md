# Files + Resources HTTP contract v1

**Issue:** #6  
**Status:** Implemented candidate  
**Authority:** ADR 0005 + `docs/domain/files-notes-v1.md`

This contract describes the public application boundary. Object-storage keys and server credentials are never part of the product API.

## Authentication rules

Three request classes exist:

1. anonymous metadata discovery: no session required;
2. authenticated relationship actions such as save/report;
3. verified-account actions that publish, mutate privacy/shares, or issue file access.

If a session credential is presented on an optional-auth route, it is validated normally. A stale/invalid presented credential is not silently downgraded to anonymous authority.

## Files

### POST /files/upload-intents

Requires active session + verified email.

Body:

```json
{
  "operationKey": "8ce114a2-ea25-4aaa-9e9e-84818f49d15c",
  "filename": "parcial-2.pdf",
  "mimeType": "application/pdf",
  "byteSize": 123456
}
```

Policy:

- maximum 50 MiB;
- allowed types: PDF, JPEG, PNG, WebP;
- filename is sanitized server-side;
- `operationKey` identifies one user upload action and is scoped to the authenticated principal;
- one immutable private object key is generated server-side;
- object key is never returned;
- retrying the same operation key with the same semantic file metadata replays the same pending FileAsset;
- reusing the same operation key for different filename/MIME/byte size fails with `FILE_UPLOAD_IDEMPOTENCY_CONFLICT`;
- a still-valid replay may receive a freshly signed PUT for the same private object key.

Authenticated capability responses are explicitly `Cache-Control: private, no-store` because they contain short-lived storage capabilities.

Response includes:

- public file id;
- declared metadata;
- short-lived signed PUT URL;
- exact headers the client must send;
- upload expiry.

The declared `byteSize` is part of the signed storage request contract. The user agent supplies the request `Content-Length`; a different body length invalidates the signed PUT. The client uploads bytes directly to object storage, and application cookies/bearers are not sent to the storage origin.

### POST /files/:fileId/finalize

Requires active session + verified email and creator ownership.

Finalize verifies:

- upload intent is still eligible;
- object exists;
- exact byte count equals declared count;
- storage Content-Type matches the intent;
- bounded byte prefix matches the supported file signature.

After storage verification, finalize stages the asset in quarantine. A lease-owned safety scan streams the verified private object without loading the full file into application memory.

Only a clean verdict may transition the asset to `ready`. A malicious verdict transitions to `rejected` and the object bytes are deleted best effort. Scanner/network failure keeps the asset non-shareable and schedules bounded retry; the client receives `FILE_SCAN_PENDING` or `FILE_SCAN_UNAVAILABLE` rather than a fabricated ready state. Repeating finalize for an already clean `ready` asset is idempotent.

Legacy `ready` rows without `scanCompletedAt + scanEngine` evidence are fail-closed and re-enter the scan path. Failure, quarantine or expiry never creates a Resource.

## Resources

### GET /resources

Optional authentication.

Query:

- `q` optional metadata query;
- `subjectId` optional Subject UUID; merged/deprecated Subject IDs are resolved through Academic Graph before filtering;
- `visibility` optional filter;
- `limit` 1–50, default 25;
- `cursor` opaque cursor.

Anonymous callers receive only `public + available` resources.

Authenticated callers may additionally receive:

- resources they author;
- resources still marked `shared` with an explicit grant for that exact Resource.

A stale grant cannot revive a Resource after it becomes `private`.

### GET /resources/:id

Optional authentication.

Read rules:

- private: author only;
- shared: author + explicit current grant;
- public: anonymous-readable;
- hidden: normal readers receive opaque not-found.

Response contains server-derived viewer capabilities:

```json
{
  "capabilities": {
    "edit": false,
    "manageShares": false
  }
}
```

It never exposes `authorUserId`, object keys, storage credentials or signed URLs.

### POST /resources

Requires active session + verified email.

Body:

```json
{
  "assetId": "uuid",
  "title": "Base de Datos - Parcial 2",
  "description": "optional",
  "tags": ["sql", "normalización"],
  "subjectId": "uuid",
  "courseOfferingId": "optional-uuid",
  "visibility": "private"
}
```

Rules:

- Subject/CourseOffering resolve through Academic Graph;
- CourseOffering must belong to the selected Subject;
- the ready asset must belong to the actor;
- `ready` is insufficient without durable `scanCompletedAt + scanEngine` evidence;
- one asset can be claimed by one Resource only;
- asset claim and Resource creation are one Mongo transaction.

### PATCH /resources/:id

Requires verified author.

Body requires `expectedRevision` plus one or more editable fields:

- title;
- description;
- tags;
- visibility.

Stale revisions fail with `RESOURCE_REVISION_CONFLICT`.

Academic context and asset identity are immutable in v1; replacement/version history is intentionally outside this contract.

### POST /resources/:id/access

Requires active session + verified email and current read authorization.

Body:

```json
{
  "disposition": "inline"
}
```

`disposition` is `inline | attachment`.

The API reauthorizes the Resource **before every issuance** and then returns a short-lived signed GET URL plus public file metadata. The authenticated API capability response is `Cache-Control: private, no-store`, and the signed S3-compatible GET also requests `Cache-Control: private, no-store` for the downloaded private bytes. Possessing a file id or old signed URL never grants issuance of a new one.

Default TTL is 300 seconds. Runtime configuration is bounded to 1–300 seconds. CI uses a shorter TTL only to prove real expiry.

### PUT /resources/:id/shares/:profileId

Requires verified author.

`profileId` is the stable public Profile UUID, not a database user id.

The server resolves it to account authority and creates an idempotent Resource-specific grant. The Resource must currently be `shared`; creating latent grants while it is `private` or `public` is rejected. Self-sharing is rejected.

### DELETE /resources/:id/shares/:profileId

Requires verified author.

Revocation affects all future metadata/access authorization immediately. Any privacy transition away from `shared` clears explicit grants atomically with the Resource revision update, so old grants cannot revive if the Resource later returns to `shared`. Previously issued signed URLs remain bounded only by their short TTL.

### PUT /resources/:id/save

Requires active session and current read access.

Creates an idempotent save relationship.

### DELETE /resources/:id/save

Requires active session.

Removes the actor's save relationship.

### GET /resources/saved

Requires active session. Returns `Cache-Control: private, no-store`. Lists the saved collection in descending save order with the existing legacy cursor contract.

### GET /resources/saved/search

Requires active session. Returns `Cache-Control: private, no-store`.

- `q` optional metadata query, 2–120 characters when present: title, description and tags, case-insensitive with Spanish accent variants. Author/Subject names are not indexed here.
- `subjectId` optional canonical Subject UUIDv4. Supply `q` or `subjectId`, or use `order=title` to browse all saved resources. Text and Subject can be combined.
- `order` optional: `saved` (default; newest save first, UUID tie-breaker) or `title` (global A–Z, Spanish collation strength 1, resource ID tie-breaker). For unfiltered default order, use the existing `/resources/saved` endpoint.
- `limit` 1–50, default 25; `cursor` is opaque (up to 2048 characters for Unicode-safe title cursors).
- Normal listing without `q` remains on `GET /resources/saved`; its legacy cursors remain unchanged.
- With text, Subject, or `order=title`, the server searches every saved relation for the current account, not only previously downloaded pages. `order=saved` keeps descending save order; `order=title` sorts all accessible matches alphabetically before applying the page limit.
- Search joins and filters current resource visibility, moderation and metadata before applying the page limit. The service rechecks readability during projection.
- Saved-date cursors (v1) remain compatible. Title cursors (v2) carry an exact last-title/UUID position and are scoped to authenticated actor, normalized query, selected Subject and title mode. Cross-query, cross-account, cross-Subject, cross-sort or legacy-cursor mixing fails with `RESOURCE_SAVED_SEARCH_CURSOR_INVALID` (422).
- Access is never granted by a bookmark, search hit, cursor or previous signed URL.
- Mobile's Subject facet counts cover all accessible saves (independent of text query), and title ordering is global when selected. The number of displayed rows remains a loaded-page count, not a total-match count. Changing order starts again from the first page.

### GET /resources/saved/subjects

Requires an active session. Response: `Cache-Control: private, no-store`.

Returns the accessible saved-resource count grouped by Subject ID, with display names resolved through Academic Graph. The query joins the actor's saves to currently available Resources, enforces current author/public/share permissions, and only then groups and counts; invisible resources must not contribute. Results are ordered by localized name in the response and bounded to **100** Subject groups with `truncated` indicating additional groups.

```json
{
  "items": [{ "subjectId": "11111111-1111-4111-8111-111111111111", "name": "Álgebra", "count": 3 }],
  "truncated": false
}
```

The count is for all accessible saves in that Subject, not a count of the current text search's matches. Mobile must disclose if the Subject list is truncated. The Subject selection is a discovery filter, not academic enrolment or question publishing authority.

Every returned row is reauthorized against current Resource visibility. Save possession never preserves access after privacy/share changes.

### POST /resources/:id/reports

Requires active session + current read access.

Body:

```json
{
  "reason": "plagiarism",
  "details": "optional bounded explanation"
}
```

Reasons:

- spam;
- plagiarism;
- copyright;
- honor_code;
- inappropriate;
- other.

One pending report relationship per reporter/resource is durable and idempotent. Resolution belongs to the moderation slice.

## File cleanup contract

Unclaimed expired assets are reclaimed by the dedicated worker:

```text
pending | scan_pending | rejected | failed | ready(unclaimed)
-> reclaiming  // atomic claim
-> delete private object bytes
-> reclaimed

scanning with an expired scan lease may also be reclaimed after its asset expiry. Active scan leases are never stolen by cleanup.
```

Resource creation can claim only `ready` assets. Therefore cleanup cannot delete bytes after a Resource has won the claim race.

A failed object deletion leaves `reclaiming` durable and retryable.

## Stable error codes

Relevant stable codes include:

- `EMAIL_VERIFICATION_REQUIRED`;
- `FILE_TYPE_UNSUPPORTED`;
- `FILE_NAME_INVALID`;
- `FILE_UPLOAD_NOT_FOUND`;
- `FILE_UPLOAD_INCOMPLETE`;
- `FILE_UPLOAD_EXPIRED`;
- `FILE_UPLOAD_INVALID`;
- `FILE_UPLOAD_STATE_CONFLICT`;
- `FILE_UPLOAD_IDEMPOTENCY_CONFLICT`;
- `FILE_UPLOAD_OPERATION_STATE_CONFLICT`;
- `FILE_STORAGE_UNAVAILABLE`;
- `FILE_SCAN_PENDING`;
- `FILE_SCAN_UNAVAILABLE`;
- `FILE_SCAN_REJECTED`;
- `RESOURCE_NOT_FOUND`;
- `RESOURCE_ASSET_UNAVAILABLE`;
- `RESOURCE_REVISION_CONFLICT`;
- `RESOURCE_UPDATE_EMPTY`;
- `RESOURCE_SHARE_SELF`;
- `RESOURCE_SHARE_VISIBILITY_REQUIRED`;
- `RESOURCE_CURSOR_INVALID`;
- `RESOURCE_UNAVAILABLE`;
- Academic Graph context errors when supplied context is invalid.

## Client obligations

Clients must not:

- persist signed URLs as durable resource URLs;
- derive access from file ids/object keys;
- send app cookies to the object-storage PUT;
- invent free-text canonical academic identity;
- assume a save/share remains authorized without server confirmation;
- silently publish a failed, quarantined or unfinished upload;
- interpret `FILE_SCAN_PENDING` as permission to create a second FileAsset; retry finalize/status flow for the same asset instead.

Web v1 implements these rules. Native Mobile must consume this same contract when its own module is closed.
