# Social + Q&A HTTP v1

## Shared rules

Authenticated mutation routes use the existing Auth session authority.

Social/Q&A writes require a verified account.

Public read routes validate optional authentication when a credential is presented and do not downgrade an invalid/stale credential to anonymous. This includes both `GET /questions` and `GET /questions/:id`.

All public user references use Profile UUID.

## Social

### PUT /social/profiles/:profileId/follow

Idempotently follow a Profile.

Response:

```json
{ "following": true }
```

Self-follow is rejected.

### DELETE /social/profiles/:profileId/follow

Idempotently unfollow.

### GET /social/me/following

Optional query:

- `limit` 1..100;
- `cursor` opaque continuation cursor.

Returns a bounded current following page with privacy-safe Profile attribution and `nextCursor` when more rows exist.

### POST /social/profiles/:profileId/connections

Create/re-open a pending connection request.

Returns the stable connection projection.

Self-connection is rejected.

### GET /social/me/connections

Query:

- `status` optional = pending/accepted/declined/disconnected;
- `limit` 1..100;
- `cursor` opaque continuation cursor.

Returns `nextCursor` when more rows exist. For pending rows, projection identifies whether the viewer is requester or recipient.

### GET /social/me/connection-requests — B147

Private authenticated inbox of **pending** connections only. Requires the existing
Auth Session; filters are applied inside MongoDB **before** paging, never after
a mixed-direction page has been loaded.

- `direction`: `incoming` (default) or `outgoing`.
- `limit`: 1..25 (default 25).
- `cursor`: optional opaque base64url continuation bound to the authenticated
  account **and** the selected direction, maximum 512 characters.
- Response: `{items: ConnectionProjection[],nextCursor: string|null}`.
- Projection reuses the existing `id,status,other,requestedByMe,incoming,
  respondedAt,createdAt,updatedAt` fields, with Profile attribution only.
  `incoming: true` means the acting account can accept or decline.
- Stable sorting: `updatedAt DESC,id ASC`; pagination is not an immutable
  snapshot if a connection changes concurrently.
- HTTP response: `Cache-Control: private, no-store`.
- Invalid, cross-owner or cross-direction cursor returns
  422 `SOCIAL_REQUEST_CURSOR_INVALID`. Bad page limit:
  422 `SOCIAL_REQUEST_LIMIT_INVALID`. Malformed repository rows are not
  projected: 503 `SOCIAL_REQUEST_DATA_INVALID`.
- No role or authorization can be inferred from a cursor: only the Auth
  principal and the stored participant/requester relationship authorize access.

### GET /social/me/connection-requests/incoming-count — B147

Private authenticated, no-store lightweight badge count:

```json
{ "pendingIncomingCount": 2 }
```

Counts pending connections where the principal is a participant **and not the
requester**. Zero is returned for an empty inbox. Datastore outages remain
errors; they never become a false zero. Counts can change after accepting,
declining or opening a session on another device; the API does not promise
push delivery or a polling cadence.

The existing `GET /social/me/connections` continues to support every status
and its previous cursor contract unchanged. No client component was modified;
the frontend team may consume these endpoints directly.

### POST /social/connections/:id/accept

Recipient-only pending transition to accepted.

### POST /social/connections/:id/decline

Recipient-only pending transition to declined.

### DELETE /social/connections/:id

Either participant may transition an accepted relation to disconnected.

## Questions

### GET /questions

Anonymous-readable. If a session credential is presented, it is validated before the search executes.

Optional query:

- `q`;
- `subjectId`;
- `status`;
- `limit` 1..50;
- `cursor`.

Returns available Questions only.

### GET /questions/:id

Returns one available Question and bounded available Answers.

### POST /questions

Verified account.

```json
{
  "subjectId": "uuid",
  "courseOfferingId": "uuid optional",
  "title": "¿Cómo encaro normalización?",
  "body": "Estoy trabado entre 2FN y 3FN."
}
```

Academic context is canonicalized through Academic Graph.

### PATCH /questions/:id

Author-only + `expectedRevision`.

Editable:

- title;
- body;
- status open/closed.

### POST /questions/:id/answers

Verified account. Question must be open and available.

### PATCH /answers/:id

Answer author-only + `expectedRevision`.

### POST /questions/:questionId/answers/:answerId/accept

Question author only.

The Answer must belong to the Question and be available.

## Reports

### POST /questions/:id/reports

### POST /answers/:id/reports

Authenticated.

Body:

```json
{
  "reason": "misinformation",
  "details": "Optional bounded context"
}
```

Repeated pending report by the same reporter/target is idempotent.

## Notifications

### GET /notifications

Optional:

- `unreadOnly`;
- `limit` 1..100;
- `cursor`.

### PATCH /notifications/:id/read

Marks only the acting user's notification as read.

### POST /notifications/read-all

Marks all currently unread notifications for the acting user.

## Stable errors

Representative domain codes:

- `SOCIAL_PROFILE_NOT_FOUND`;
- `SOCIAL_SELF_RELATION_INVALID`;
- `SOCIAL_CONNECTION_NOT_FOUND`;
- `SOCIAL_CONNECTION_STATE_CONFLICT`;
- `SOCIAL_CONNECTION_RECIPIENT_REQUIRED`;
- `SOCIAL_CURSOR_INVALID`;
- `QUESTION_NOT_FOUND`;
- `QUESTION_CLOSED`;
- `QUESTION_REVISION_CONFLICT`;
- `ANSWER_NOT_FOUND`;
- `ANSWER_REVISION_CONFLICT`;
- `ANSWER_QUESTION_MISMATCH`;
- `NOTIFICATION_NOT_FOUND`.

Validation continues to use the repository-wide request/error envelope.
