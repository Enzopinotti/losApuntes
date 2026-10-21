# B162 — My Q&A discussions (private participation preview)

## Purpose

One private view for returning to Q&A threads where a student **asked or
answered**. A question appears at most once even if its owner also answered
it or the user posted several replies. This solves the fragmentation
between B145 My Questions and B146 My Answers. It complements B159
global Q&A counts, B160 subject activity and B161 question follow-ups.

It is a limited preview, **not** a public feed, unread-inbox, history
export, moderation bypass or reputation/engagement leaderboard.

## HTTP: GET /qa/me/discussions

- Authenticated, revocable `AuthSessionGuard`; no query or body inputs.
- The owner is determined **only** by the validated session
  `request.user.id` on the server.
- `Cache-Control: private, no-store` on 200 responses.

Example:

    {
      "items": [
        {
          "questionId": "question-uuid",
          "subjectId": "subject-uuid",
          "title": "How do I prepare for the exam?",
          "state": "open",
          "isQuestionAuthor": true,
          "ownVisibleAnswersCount": 2,
          "lastActivityAt": "2026-10-19T13:30:00.000Z"
        }
      ],
      "hasMore": false
    }

At most **15 cards**, sorted by `lastActivityAt DESC, questionId ASC`
to break ties deterministically. A 16th row sets `hasMore=true`.
New accounts return `{"items":[],"hasMore":false}`.

This top-15 preview deliberately does not provide a cursor, total, search,
or exhaustive pagination; use existing paginated owner endpoints for
those workflows.

## Field semantics and authorization

- A thread is eligible if the caller authored a **visible**
  `Question`, or authored at least one **visible** `Answer` whose
  parent `Question` remains visible.
- Parent questions must have `moderationState=available` and
  `state=open|closed`. Hidden/orphaned parents are **always excluded**,
  even when the requesting user authored the answer.
- Hidden answers never count as participation. An owner-authored
  question may still appear when one of their answers is hidden.
- `isQuestionAuthor` is true only when a visible question was
  authored by this session owner. It does **not** return the question's
  external author ID when false.
- `ownVisibleAnswersCount` counts visible answers authored by the
  caller **within this thread only**. It does not count other people's
  replies or rely on the stored general `answerCount`.
- `lastActivityAt` is the latest `updatedAt` among the owner's
  visible question (when owned) and visible answers (when authored).
  A question's `updatedAt` may advance due to lifecycle mutations;
  this is **not** a guaranteed unread/new-reply timestamp.
- Only the visible parent title and subject ID are returned;
  no answer body, external user/actor ID, moderation state,
  accepted answer identifier or internal DB keys are emitted.

## Persistence

A **single read-only Mongo aggregation** on `questions`:
1. Match caller-owned, available questions.
2. `$unionWith` available caller-authored `answers`, with a bounded
   `$lookup` of the available parent by uniquely indexed `questions.id`.
3. `$group` by question ID **before** sorting/limiting. Merge author
   membership with `$max`, sum own visible answers and retain latest
   participation timestamp.
4. Sort and limit **16** rows on the server to produce a maximum
   of 15 cards and a `hasMore` flag.

Owner filters are pushed into each union branch; the existing owner
indexes and stable indexed Question ID are reused. No unbounded array
of raw answers is sent to Node. A Mongo `maxTimeMS=5000` cap is
applied, but this does not guarantee constant server CPU with large
owner histories.

The view is not a snapshot transaction. Concurrent edits/moderation
may change its contents on refresh. Incorrect/duplicate rows,
invalid dates, unexpected states, negative or non-integer counts, and
more than 16 returned rows fail closed with HTTP 503 code
`QA_DISCUSSIONS_UNAVAILABLE`; Mongo failures propagate instead of
becoming fabricated empty data.

## Product / quality / release

- Frontend can link each card to the existing authorized question
  details, with normal visibility checks at navigation time.
- Tests assert owner scoping, answer parent moderation, one card per
  discussion, safe projections, stable ordering, 15/16-row behavior,
  account-empty state, corruption rejection and DB failures.
- Unit tests validate the generated pipeline; a separate live Mongo
  acceptance is needed to establish end-to-end execution of
  `$unionWith` and `$lookup` under the project's runtime.
- No Web/Mobile, Q&A core, schema, auth, migrations or lockfile changes.
- Gate requirements: strict API ESLint, Prettier/TS, Jest, ten
  critical coverage jobs, global Quality Gate, runtime smoke and
  **passed** high/critical production dependency audit.
- Keep issues #133/#141 and release #353 HOLD without audit waivers.
