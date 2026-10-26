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

Web clients may continue the result with `nextCursor`. They should deduplicate
appended Questions by id and stop pagination if the server repeats the
requested or any previously used cursor; a fresh request without `cursor`
restarts the search.

### GET /questions/:id

Returns one available Question and bounded available Answers.

The embedded Answer page includes `answersNextCursor` and `answersLimit`.
Continuation uses `GET /questions/:questionId/answers`; clients should
deduplicate appended Answers by id and stop if a continuation cursor repeats.
A request without `cursor` reloads the first Answer page.

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

### GET /notifications/unread-count

Authenticated-only, owner-scoped, no parameters, with `Cache-Control: private, no-store`.

```json
{ "unreadCount": 4 }
```

The API computes the count directly over the acting Account's unread rows (`userId` + `readAt: null`) through the existing indexed notification store. It never returns notification bodies, actor details, target IDs or data belonging to another account. A storage error is a request failure, **not** a false zero count. Useful for a client badge without listing entire pages of notifications. Counts can change between requests; no polling or push delivery is implied. Existing `GET /notifications`, `PATCH /notifications/:id/read` and `POST /notifications/read-all` contracts remain unchanged.

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
