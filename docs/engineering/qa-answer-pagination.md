# Q&A Answer pagination

**Canonical issue:** #88

## Problem

Question search was already cursor-paginated, but Question detail loaded Answers with a
fixed `limit=100` and returned only:

```ts
{ question, answers }
```

That bounded the database read, but it was not an honest inventory contract:
Questions with more than 100 available Answers silently hid the tail and Web had
no way to continue.

## Contract

The initial Question detail remains convenient for existing clients:

```ts
{
  question: QuestionView;
  answers: AnswerView[];
  answersNextCursor: string | null;
  answersLimit: number;
}
```

Default embedded Answer page:

- 25 Answers.

Maximum continuation page:

- 50 Answers.

Continuation route:

- `GET /questions/:questionId/answers?limit=...&cursor=...`

The route is anonymous-readable like Question detail, but still passes through
optional Auth so viewer capabilities are projected correctly when a valid
session is present.

## Stable cursor

Answer ordering is intentionally chronological:

1. `createdAt ASC`;
2. `id ASC` tie-breaker.

The opaque cursor encodes `createdAt + id`.

Continuation reads:

- rows with a newer `createdAt`; or
- rows with the same `createdAt` and a greater `id`.

Mongo fetches `limit + 1`; the extra row is only a has-more sentinel.

`updatedAt` is not used because editing an Answer must not move it between
pages.

## Visibility and moderation

Every Answer page filters:

- the requested `questionId`;
- `moderationState = available`.

The continuation endpoint re-validates that the parent Question itself remains
visible before reading Answers. A hidden Question cannot be used as an oracle
for its Answer inventory.

## Web

The Questions page:

- keeps the first embedded page in `selected.answers`;
- shows “Cargar más respuestas” only when `answersNextCursor` exists;
- appends pages instead of replacing existing Answers;
- deduplicates by Answer id;
- resets to a fresh first page after create/edit/accept operations through the
  existing Question refresh path.

## Error semantics

Malformed continuation cursor:

- HTTP 422;
- code `ANSWER_CURSOR_INVALID`.

No persistence read is attempted with an invalid cursor.

## Evidence

Required regression evidence:

- service first-page metadata;
- service continuation cursor decode;
- malformed cursor rejected before store read;
- Mongo exact-max and max+1 tests;
- Mongo `createdAt/id` continuation predicate;
- Web contract requires Answer continuation + dedupe;
- runtime Social/Q&A smoke traverses two Answer pages and validates cursor
  rejection;
- runtime Question detail confirms `answersLimit` and
  `answersNextCursor`.

## Mobile

There is no current native Q&A Answer detail surface in Mobile. The server
contract is paginated now so a future native screen must consume
`answersNextCursor` rather than treating the embedded first page as complete.
