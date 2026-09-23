# Feeds HTTP v1

All Feed routes require an authenticated session. Feed reads do not expose private source content beyond what the source domain already authorizes.

## GET /feeds/academic

Query:

- `limit` 1..25, default 20;
- `cursor` optional opaque continuation cursor.

Returns:

```json
{
  "items": [],
  "nextCursor": null,
  "stopReason": "end",
  "context": {
    "subjectIds": []
  }
}
```

Ordering is deterministic chronological. If no current Subjects exist, returns an empty page.

## GET /feeds/for-you

Query:

- `limit` 1..25, default 20;
- `cursor` optional;
- `mode` = balanced | study | discover | community;
- `order` = ranked | chronological.

Each item contains:

- `type` = resource | question;
- stable target id;
- title/summary;
- privacy-safe author attribution;
- canonical Subject attribution;
- createdAt;
- `why[]` explanation codes.

Response includes:

- effective signal controls after Profile consent is applied;
- nextCursor;
- stopReason = null | end | natural_break.

## GET /feeds/preferences

Returns the durable Feed preferences and revision.

## PATCH /feeds/preferences

Requires `expectedRevision`.

Editable:

- useAcademic;
- useSocial;
- useInterests;
- mutedSubjectIds;
- mutedProfileIds;
- prioritizedSubjectIds.

Subject ids are canonicalized. Profile ids must resolve.

Empty/duplicate arrays are normalized deterministically.

A stale revision returns `FEED_PREFERENCES_REVISION_CONFLICT`.

## PUT /feeds/feedback/:type/:id

`type` is `resource` or `question`.

Body:

```json
{ "signal": "more" }
```

Signal is `more | less`.

The target must currently exist and be readable to the user. Feedback is idempotent and increments Feed state revision only when the effective signal changes.

## DELETE /feeds/feedback/:type/:id

Clears explicit feedback if present and advances Feed state revision when state changed.

## Stable errors

- `FEED_CURSOR_INVALID`;
- `FEED_CURSOR_STALE`;
- `FEED_CURSOR_CONTEXT_MISMATCH`;
- `FEED_PREFERENCES_REVISION_CONFLICT`;
- `FEED_PROFILE_NOT_FOUND`;
- `FEED_FEEDBACK_TARGET_NOT_FOUND`.

Source-domain authorization errors remain opaque; Feed does not reveal whether hidden content exists.

## Healthy-use contract

A client must not synthesize endless pagination after `stopReason = natural_break`.

A fresh user action may explicitly start a new feed session, producing a new anchor. The API intentionally does not provide a cursor that bypasses the three-page natural stop.
