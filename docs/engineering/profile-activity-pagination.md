# Profile activity pagination

**Canonical issue:** #88

## Problem

Profile activities were a genuinely growing user-owned collection.

Both:

- `GET /profile/me`; and
- `GET /profiles/:profileId`

loaded every activity through an unbounded Mongo `.find({ userId })`.

Web then rendered the whole array and implicitly treated the snapshot as a
complete inventory.

## Pagination contract

The first profile snapshot embeds the first activity page for convenience.

Default page size:

- 20 activities.

Maximum requested page size:

- 50 activities.

Continuation endpoints:

- authenticated owner: `GET /profile/me/activities`;
- anonymous/public view: `GET /profiles/:profileId/activities`.

Responses are:

```ts
{
  items: ProfileActivity[];
  nextCursor: string | null;
}
```

The owner snapshot also exposes:

- `activitiesNextCursor`;
- `activitiesLimit`.

The public profile exposes those fields only when the Activities section itself
is public.

## Stable cursor

The cursor is opaque to clients and encodes:

- immutable `createdAt`;
- `id` as a deterministic tie-breaker.

Ordering is:

1. `createdAt DESC`;
2. `id ASC`.

The continuation predicate is:

- rows with older `createdAt`; or
- same `createdAt` and greater `id`.

We intentionally do **not** use `updatedAt` as a cursor key. Editing an
activity changes `updatedAt` and could otherwise move a row between pages,
causing duplicates or gaps.

Mongo fetches `limit + 1`; the extra row is only a has-more sentinel.

## Privacy

The public continuation endpoint re-checks the profile and requires:

`visibility.activities === 'public'`.

A profile whose Activities section is private/non-public does not expose a
separate activity inventory through the continuation route.

## Web behavior

Owner and Public Profile:

- append pages instead of replacing the current list;
- deduplicate by activity id when pages are concatenated;
- never assume the first embedded page is complete;
- show “Cargar más actividades” only when `nextCursor` exists.

Create/delete operations still refresh the initial owner snapshot so stale
cursors are not reused after a mutation.

## Mobile

There is no native Profile activity screen in the current Mobile product.
The server contract is paginated now so a future Mobile surface must consume
`nextCursor` instead of assuming the first page is complete.

## Regression evidence

Required:

- Mongo exactly-max test -> `hasMore=false`;
- Mongo max+1 test -> only max rows returned + `hasMore=true`;
- Mongo continuation predicate test for `createdAt/id`;
- service test decoding an opaque cursor;
- malformed cursor -> stable `PROFILE_ACTIVITY_CURSOR_INVALID`;
- public continuation only when Activities is public;
- Web contract requires continuation clients and id dedupe;
- runtime smoke traverses two owner pages and verifies the public route.

## Non-goals

This carrier does not impose an arbitrary lifetime cap on profile activities.
Older activities remain reachable by cursor and manageable by the owner.
