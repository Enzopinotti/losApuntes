# Organization bounded collection caps

**Canonical issue:** #88  
**Related authority contract:** `docs/engineering/organization-commit-authority.md`

## Collections

Campus Organizations intentionally keep three complete, small collections:

- managers: 20;
- useful links: 20;
- featured Resources: 20.

These are product invariants, not UI conventions.

## Why service prechecks were insufficient

A precheck such as:

```ts
const rows = await store.listLinks(id);
if (rows.length >= 20) reject();
await store.createLink(...);
```

is race-prone.

Two requests can both observe 19 and then insert distinct rows. Once that
happens, every caller that assumes “this collection is bounded by design” loses
its amplification guarantee.

The persistence transaction is therefore the authority for capacity.

## Shared limits

The canonical values live in:

`apps/api/src/organizations/domain/organization-limits.ts`

Do not duplicate numeric literals in controllers/services/stores.

## Links and featured Resources

Authorized managed writes already run inside Mongo transactions, but inserts
into different rows do not naturally conflict.

Organization now has an internal `capacityRevision` field. It is not part of
the public Organization record and exists only as a serialization point.

For a new Link or Featured Resource:

1. revalidate management authority;
2. update the Organization's `capacityRevision` inside the transaction;
3. count the target collection in that same transaction;
4. reject if the count is already at the configured limit;
5. otherwise insert + audit.

Concurrent capacity writers touch the same Organization document. Mongo forces
one transaction to retry/abort instead of letting both commit from the same
stale count.

Existing Featured Resource membership remains idempotent and does not consume a
new capacity slot or bump the capacity epoch.

## Managers

Manager changes already serialize on `managementRevision`.

When adding a previously absent manager, `changeManager()` now counts current
managers inside that same authoritative transaction and returns
`manager_limit` before target mutation/audit when capacity is full.

A concurrent manager mutation that wins first changes
`managementRevision`; the loser cannot commit with the old revision.

## Stable API errors

Persistence outcomes are mapped to the existing product errors:

- `manager_limit` -> `ORGANIZATION_MANAGER_LIMIT`;
- Link collection limit -> `ORGANIZATION_LINK_LIMIT`;
- Featured Resource collection limit -> `ORGANIZATION_RESOURCE_LIMIT`.

Clients do not need a new error contract.

## Defensive reads

Even though writes now preserve the invariant, historical drift must not turn a
complete-list projection into an unbounded query.

Mongo reads at most `limit + 1` rows for:

- managers;
- links;
- featured Resources.

Public Organization projection still exposes at most the configured limit.

Management snapshot must be complete. If the manager sentinel row exists, it
fails closed with:

`ORGANIZATION_MANAGER_CAPACITY_INVARIANT`

instead of hiding an extra manager from an administrator.

## Tests

Required regression evidence:

- Link count=20 -> no insert/audit;
- Link count=19 -> insert/audit succeeds;
- capacity serialization write happens before Link count;
- existing Featured Resource stays idempotent without capacity lock;
- new Featured Resource at 20 -> no insert/audit;
- Manager count=20 -> no manager mutation/audit;
- service performs no list preload for Link/Featured/Manager capacity;
- complete collection reads use max+1 defensive limits;
- management snapshot fails closed on manager drift > 20.

## Rule for future bounded Organization collections

If a future collection is described as “bounded by design”:

1. define one shared domain limit;
2. enforce it at the persistence commit boundary;
3. serialize concurrent additions on a common authoritative document/epoch;
4. bound complete reads defensively;
5. preserve honest overflow behavior for management/admin surfaces.

A UI-only or service-only length check is not a capacity invariant.
