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
  "filename": "parcial-2.pdf",
  "mimeType": "application/pdf",
  "byteSize": 123456
}
```

Policy:

- maximum 50 MiB;
- allowed types: PDF, JPEG, PNG, WebP;
- filename is sanitized server-side;
- one immutable private object key is generated server-side;
- object key is never returned.

Response includes:

- public file id;
- declared metadata;
- short-lived signed PUT URL;
- exact headers the client must send;
- upload expiry.

The client uploads bytes directly to object storage. Application cookies/bearers are not sent to the storage origin.

### POST /files/:fileId/finalize

Requires active session + verified email and creator ownership.

Finalize verifies:

- upload intent is still eligible;
- object exists;
- exact byte count equals declared count;
- storage Content-Type matches the intent;
- bounded byte prefix matches the supported file signature.

A successful finalize transitions the asset to `ready`. Repeating finalize for the same already-ready asset is idempotent.

Failure or expiry never creates a Resource.

## Resources

### GET /resources

Optional authentication.

Query:

- `q` optional metadata query;
- `subjectId` optional canonical Subject UUID;
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

The API reauthorizes the Resource **before every issuance** and then returns a short-lived signed GET URL plus public file metadata. Possessing a file id or old signed URL never grants issuance of a new one.

Default TTL is 300 seconds. Runtime configuration is bounded to 1–300 seconds. CI uses a shorter TTL only to prove real expiry.

### PUT /resources/:id/shares/:profileId

Requires verified author.

`profileId` is the stable public Profile UUID, not a database user id.

The server resolves it to account authority and creates an idempotent Resource-specific grant. Self-sharing is rejected.

### DELETE /resources/:id/shares/:profileId

Requires verified author.

Revocation affects all future metadata/access authorization immediately. Previously issued signed URLs remain bounded only by their short TTL.

### PUT /resources/:id/save

Requires active session and current read access.

Creates an idempotent save relationship.

### DELETE /resources/:id/save

Requires active session.

Removes the actor's save relationship.

### GET /resources/saved

Requires active session.

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
pending | failed | ready(unclaimed)
-> reclaiming  // atomic claim
-> delete private object bytes
-> reclaimed
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
- `FILE_STORAGE_UNAVAILABLE`;
- `RESOURCE_NOT_FOUND`;
- `RESOURCE_ASSET_UNAVAILABLE`;
- `RESOURCE_REVISION_CONFLICT`;
- `RESOURCE_UPDATE_EMPTY`;
- `RESOURCE_SHARE_SELF`;
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
- silently publish a failed or unfinished upload.

Web v1 implements these rules. Native Mobile must consume this same contract when its own module is closed.
