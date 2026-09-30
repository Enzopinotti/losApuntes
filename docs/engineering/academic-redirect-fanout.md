# Academic redirect fan-out bounds

**Canonical issue:** #88

## Problem

Academic catalog redirects already had a forward depth limit, but reverse
canonical-identity expansion was not bounded by fan-out.

A canonical node may accumulate many merged aliases. The previous
`catalogIdentitySet()` implementation:

- queried redirect sources once per frontier node;
- returned every matching row from Mongo;
- multiplied queries with each breadth level;
- silently stopped after the reverse depth loop.

That allowed a large redirect fan-in to amplify both Mongo work and application
memory/CPU in catalog search, child listing and continuity-follow projection.

## Runtime invariant

The canonical identity set is bounded to:

`ACADEMIC_REDIRECT_IDENTITY_LIMIT = 256`

The store accepts the **whole frontier** for a level and performs one query:

```ts
findDirectRedirectSources(targetIds, limit)
```

Mongo uses:

- `status = merged`;
- `redirectToId IN frontier`;
- stable `id ASC` order;
- `limit + 1` sentinel.

The service therefore performs at most one redirect-source query per reverse
depth level instead of one query per identity.

## Fail-closed behavior

If one level has more sources than the remaining identity budget, the operation
fails with:

`ACADEMIC_REDIRECT_FANOUT_OVERFLOW`

No catalog search/child lookup/follow projection proceeds using a silently
truncated identity set.

If reverse ancestry still has another level after `MAX_REDIRECT_DEPTH = 8`,
the operation fails with:

`ACADEMIC_REDIRECT_TOO_DEEP`

Reverse traversal therefore mirrors the forward resolver's fail-closed depth
semantics.

## Merge guard

Before merging source -> canonical target, the service resolves the complete
bounded identity sets of both sides.

If their union would exceed 256 identities, the merge is rejected before any
write.

A target id that is itself an alias resolving back to the source is treated as
a self merge and rejected with `ACADEMIC_MERGE_SELF`.

## Concurrency

A preflight budget check alone is insufficient because two merges into the same
canonical target could race.

The merge transaction therefore performs an optimistic revision bump on the
canonical target before updating the source redirect.

Consequences:

- concurrent merges that observed the same target revision serialize;
- one merge wins the target revision;
- the loser returns `ACADEMIC_REVISION_CONFLICT`;
- if the source update later fails, the target revision bump rolls back with the
  same transaction;
- the target revision now reflects semantic changes to its canonical identity
  group.

## Index

The catalog schema includes:

```
{ status: 1, redirectToId: 1, id: 1 }
```

to support bounded reverse-frontier traversal.

## Regression evidence

Required:

- Mongo max/max+1 redirect frontier query;
- empty frontier does not query Mongo;
- one bounded query per reverse level;
- fan-out overflow prevents downstream catalog search;
- reverse-depth overflow fails closed;
- combined source+target identity overflow prevents merge;
- indirect self merge via an alias is rejected;
- target revision conflict prevents source mutation and audit;
- Mongo optimistic target revision bump is tested.

## Non-goals

This limit is a runtime safety boundary, not a product-visible pagination
feature. A canonical identity graph larger than the budget requires catalog
repair/consolidation rather than silently exposing only part of the identity
set.
