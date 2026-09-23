# Social + Q&A HTTP v1

## Shared rules

Authenticated mutation routes use the existing Auth session authority.

Social/Q&A writes require a verified account.

Public read routes may accept optional authentication but do not downgrade an invalid presented credential to anonymous.

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

Returns bounded current following list with privacy-safe Profile attribution.

### POST /social/profiles/:profileId/connections

Create/re-open a pending connection request.

Returns the stable connection projection.

Self-connection is rejected.

### GET /social/me/connections

Query:

- `status` optional = pending/accepted/declined/disconnected;
- `limit` 1..100.

For pending rows, projection identifies whether the viewer is requester or recipient.

### POST /social/connections/:id/accept

Recipient-only pending transition to accepted.

### POST /social/connections/:id/decline

Recipient-only pending transition to declined.

### DELETE /social/connections/:id

Either participant may transition an accepted relation to disconnected.

## Questions

### GET /questions

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
- `QUESTION_NOT_FOUND`;
- `QUESTION_CLOSED`;
- `QUESTION_REVISION_CONFLICT`;
- `ANSWER_NOT_FOUND`;
- `ANSWER_REVISION_CONFLICT`;
- `ANSWER_QUESTION_MISMATCH`;
- `NOTIFICATION_NOT_FOUND`.

Validation continues to use the repository-wide request/error envelope.
