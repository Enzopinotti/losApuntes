# Academic user inventory bounds

**Canonical issue:** #88

## Problem

Several account-owned Academic collections were read with unbounded Mongo
queries:

- affiliations;
- subject participations;
- academic follows.

Those reads serve two different purposes:

1. **presentation** — show recent history in Web/API;
2. **domain decisions** — determine lifecycle phase, graduation effects or
   whether a current Subject is eligible.

Using one unbounded primitive for both makes cost grow with account history.
Replacing it with a blind small `limit` would be worse: a truncated decision
could silently classify the user incorrectly or graduate only part of the
current-subject set.

## Two budget classes

### Visible inventory budgets

Presentation may return a bounded window with honest metadata:

- affiliations: 50;
- subject participations: 100;
- follows: 100.

Responses expose `truncated` and `limit` when applicable. Truncation does not
delete or mutate history.

### Decision snapshot budgets

A domain decision may proceed only when all rows relevant to that decision fit
inside its explicit snapshot budget:

- affiliations: 128;
- current subject participations: 256.

The store fetches `limit + 1`. If the extra sentinel exists, the service
throws:

`ACADEMIC_INVENTORY_OVERFLOW`

No mutation may be derived from the incomplete snapshot.

Current-subject eligibility scopes the affiliation query to
`active|paused` before applying the budget.

Graduation scopes participation reads to `state=current` before applying the
budget.

## Follows

Follows affect presentation/continuity, not graduation eligibility or student
phase. Lifecycle therefore uses a bounded follow window (256) and returns:

- `follows`;
- `followsTruncated`;
- `followsLimit`.

Overflow is explicit but does not block unrelated lifecycle classification.

The direct `GET /academic/me/follows` inventory uses a 100-row visible budget
and also returns `truncated` + `limit`.

## Mongo contract

Every affected store method requires an explicit `limit` and returns:

```ts
{
  items: T[];
  hasMore: boolean;
}
```

Mongo requests only `limit + 1`, then returns at most `limit` rows.

Stable ordering remains:

- `updatedAt DESC`;
- `id ASC` tie-breaker.

Indexes are aligned with account scope, optional status/state filters and that
ordering.

## UI contract

The Academic Lifecycle page must not imply completeness when history is
truncated.

It discloses:

- the affiliation visible budget;
- follow-summary truncation;
- that complete history remains preserved;
- that decisions are not executed from a truncated lifecycle snapshot.

When the backend returns `ACADEMIC_INVENTORY_OVERFLOW`, Web explains that the
operation was not applied because the complete decision history could not be
safely loaded within the guardrail.

## Regression evidence

Required:

- Mongo max/max+1 tests for affiliations, participations and follows;
- visible affiliation response exposes `truncated/limit`;
- current-subject eligibility overflow fails before upsert;
- lifecycle affiliation overflow fails closed;
- graduation current-subject overflow fails before transition;
- follow inventory preserves truncation metadata;
- Web contract pins truncation disclosure;
- runtime Academic smoke validates bounded response metadata.

## Future pagination

This hardening intentionally introduces bounded windows first. Full cursor
pagination can later replace visible-window truncation without weakening the
decision-snapshot rule.

Do not reuse a paginated first page as a complete lifecycle or graduation
snapshot.
