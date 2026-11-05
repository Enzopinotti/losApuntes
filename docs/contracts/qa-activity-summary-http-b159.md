# B159 — Private Q&A activity summary v1

## Purpose and authority

Provide an inexpensive overview of a student's academic Q&A contributions for
Profile/Home/Community. This is a bounded **aggregate**, not a second Q&A store,
ranking system or replacement for B145 `GET /questions/mine` and B146
`GET /answers/mine`.

Related canonical rules: QA-FR-002 (question lifecycle), QA-FR-003 (answers
and acceptance), SOC-NFR-001 (bounded reads), NFR-SEC-001 (least privilege),
NFR-PRIV-001 (data minimization), NFR-PERF-001 (bounded queries).

## GET /qa/me/activity-summary

- Existing revocable `AuthSessionGuard` required. No request body or query
  parameters. Owner comes **only** from the server-validated session.
- `Cache-Control: private, no-store`.
- HTTP 200 response:

  {
  "questionsTotal": 8,
  "questionsOpen": 5,
  "questionsClosed": 3,
  "questionsOpenWithoutAcceptedAnswer": 2,
  "answersVisible": 12,
  "answersAccepted": 4
  }

All values are nonnegative safe-integer counts. The brand-new-account result
is six zeros. No content text, email, internal account identifiers, profile
attribution, subject names or individual IDs leave the API.

Definitions:

- Questions count only the caller's `moderationState=available` records with
  `state=open|closed`.
- `questionsTotal = questionsOpen + questionsClosed`.
- `questionsOpenWithoutAcceptedAnswer` includes available, open questions
  without a stored accepted Answer ID. It is **not** a claim that there are no
  answers: responses may exist without an accepted answer.
- `answersVisible` counts only caller-authored, available Answers whose
  **original Question remains available**. Orphan/hidden-parent answers are
  excluded, even though authored by the requesting student.
- `answersAccepted` is the subset of those visible Answers whose own ID
  equals the visible Question's `acceptedAnswerId`.
- Hidden content and malformed lifecycle states never inflate the counts.

## Storage and consistency

Two indexed, owner-first Mongo aggregate pipelines. Questions use
`authorUserId`; Answers use `authorUserId` and a lookup on indexed,
stable Question `id` with available moderation projection before counting.
The pipeline returns at most one grouped result per collection, not paginated
document arrays; no new collection, write endpoint, migration or change in
moderation enforcement.

Both pipelines have a five-second Mongo execution limit. A timeout is treated
as a database failure and never converted into zero counts.

Aggregates execute concurrently and are a best-effort view, **not an atomic
cross-collection snapshot**. During accept/hide/reply mutations the counts may
briefly differ. After a write, clients can refetch. Invalid group totals fail
with HTTP 503 and `QA_ACTIVITY_SUMMARY_UNAVAILABLE`; Mongo failures propagate
through existing centralized exception handling rather than fabricate zeros.

## Client integration and acceptance

- API-only, independent Nest module. Do not edit Web/Mobile or Q&A controllers
  owned by pending PRs B145/B146.
- Clients present these numbers as useful status, not comparative reputation,
  gamified popularity or recruiting signals.
- Test session ownership, no-store HTTP, available-only filtering, join to
  available Questions, accepted-answer identity, zero counts, corrupt
  aggregates and persistence failures.
- CI exact-HEAD, strict lint, types, Prettier, Jest, critical coverage and
  runtime smoke are separate mandatory release evidence.
- Production high/critical dependency audit must pass; current #133/#141 and
  release #353 remain blocking. No bypass/waiver, merge or deploy while blocked.
