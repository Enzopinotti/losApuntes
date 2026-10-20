# B161 — My Q&A follow-ups (private, actionable preview)

## Goal

Surface two owner-only lists of **open, available questions without an
accepted answer**, so a student can decide which question to revisit.
This is a private dashboard preview, not a replacement for the paginated
`GET /questions/mine` from B145. It complements the global counts (B159)
and per-subject activity (B160). No public ranking, reputation or notification
fanout is added.

## HTTP contract

**GET /qa/me/follow-ups**

- Existing `AuthSessionGuard` and revocable session are required.
- `request.user.id` is the only allowed owner identity. No query/body
  parameters. Anonymous clients receive the existing auth guard response.
- `Cache-Control: private, no-store`.
- Successful response (example):

    {
      "needsReview": {
        "items": [
          {
            "questionId": "q-uuid",
            "subjectId": "subject-uuid",
            "title": "How should I prepare the final?",
            "updatedAt": "2026-10-19T13:30:00.000Z"
          }
        ],
        "hasMore": false
      },
      "awaitingReplies": {
        "items": [],
        "hasMore": false
      }
    }

Each lane has a maximum of **5 question cards**. The sixth entry, if any,
sets `hasMore=true`. No nextCursor in this v1 preview. For exhaustive
question management the client opens `GET /questions/mine` with its own
authorized pagination and filters.

## Status semantics

Candidate questions are restricted to:
`authorUserId=sessionOwner`, `moderationState=available`,
`state=open`, `acceptedAnswerId=null`.

- `needsReview`: at least one **available** Answer exists for that
  question; the question has no accepted answer yet.
- `awaitingReplies`: no **available** Answer exists for that question;
  hidden answers do **not** count as available replies.
- A closed question, moderated/hidden question or one with any accepted
  answer is never advertised as actionable by this v1 preview.
- The API does not rely on stored `Question.answerCount`, which can
  include unavailable/hidden answers. No actor IDs, answer content, raw
  moderation states or hidden-answer counts are returned.
- Results within each lane are ordered `updatedAt DESC, id ASC`.
  `updatedAt` is the question's update timestamp, **not** guaranteed
  to be the time of the newest Answer. This preview must not be labeled
  “new replies”, “unread answers”, or promise push notifications.
- Actions taken after a fetch may change these lists on the next refresh;
  this response does not form a cross-collection transaction snapshot.

## Persistence and performance

One read-only `questions.aggregate`, filters owner and allowed state
**before** any join; sorted by last question update then lookups against
`answers.questionId` indexed field with `moderationState=available`,
projecting only `_id` and stopping after one qualifying Answer. A single
`$facet` builds both lanes and caps each branch at 6 rows server-side.

This avoids leaking answer bodies/authors, avoids an N+1 application-loop,
and bounds the outgoing payload. Mongo's `maxTimeMS=5000` guards
pathological unbounded owner histories; server processing may still scan
the owner's open unanswered questions and is **not** a proof of constant
CPU work. Existing schema/indexes are reused; no migration, new index,
write endpoint, auth changes or frontend/mobile changes.

Malformed rows, missing facet arrays, duplicates, wrong lane state, bad
dates or overflow fail closed with HTTP 503
`QA_FOLLOW_UPS_UNAVAILABLE`; Mongo errors propagate through existing
exception handling, never as synthetic empty inboxes.

## Acceptance and release

- Unit tests: owner-only match, moderation-aware existence lookup,
  accepted exclusion, stable ordering and two lane limits, response
  projections, empty account, malformed data and DB failure.
- Controller tests: auth guard, no-store, ignore client-selected user IDs.
- For production qualification: strict API ESLint, Prettier/TypeScript,
  related Jest, full Quality Gate, all critical coverage and separate
  live Mongo acceptance. A mock-verified pipeline is not proof of real
  Mongo execution.
- No merge or deploy until production dependency audit high/critical
  is green. Issues #133/#141 and #353 release HOLD remain blocking.
