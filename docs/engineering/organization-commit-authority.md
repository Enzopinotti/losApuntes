# Organization commit-authority fencing

**Canonical issue:** #84

## Invariant

An HTTP/service precheck is useful for a fast rejection, but it is not the
authority that permits a managed Organization write to commit.

For any write whose permission depends on the current Organization manager
role, the write may commit only if the same Mongo transaction can still prove:

1. the Organization exists and is active;
2. its `managementRevision` is the revision captured by the service precheck;
3. the actor is still a manager;
4. the actor's current role is one of the roles allowed for the mutation;
5. the target mutation's own revision/state precondition still holds where
   applicable.

If any authority condition changed, the transaction aborts with
`ORGANIZATION_AUTHORITY_STALE`. The caller must refresh management context
before deciding whether to retry.

## Why managementRevision is the authority epoch

Manager grants, role changes and revocations already increment
`managementRevision` transactionally. A managed content request captures that
revision from the active Organization snapshot.

Therefore a revoke/demote that commits before the content write changes the
epoch. The old write cannot pass the transaction fence, even if its earlier
`requireRole()` precheck succeeded.

This creates deterministic ordering:

- write transaction commits first -> it is valid history; a later revoke does
  not retroactively invalidate it;
- revoke/demote transaction commits first -> the old write sees stale authority
  and does not commit.

Archive requires one stronger ordering guarantee because it also shuts the
Organization itself down. Every managed mutation whose target lives in a
separate collection takes an internal write fence on the Organization document
before touching that target. The fence increments the hidden
`capacityRevision` serialization counter inside the same transaction. Archive
and Organization profile updates already write the Organization document
directly. Therefore an in-flight content mutation and archive cannot both
commit from the same active authority snapshot: Mongo must serialize them via a
write conflict/retry, and the loser revalidates active status and
`managementRevision` before it can proceed.

## Managed writes covered

The single `OrganizationStore.commitAuthorizedMutation()` boundary owns:

- Organization archive, including transactional revocation of every manager
  grant;
- Organization profile update;
- Post create/update/delete;
- Event create/update;
- Link create/delete;
- Resource feature/unfeature.

The raw Mongo write methods for those operations are intentionally not exposed
by the store contract or adapter.

Platform verification updates remain a separate privileged workflow because
their authority is not an Organization manager role.

Follow/unfollow and user reports are also outside this fence because they are
actions performed under the caller's own user authority rather than delegated
Organization management authority.

## Transaction contents

For an authorized managed write the transaction contains:

- current Organization/management epoch check;
- current actor manager-role check;
- an Organization-document write fence before separate-collection mutations;
- target write;
- optimistic target revision check where applicable;
- for archive, the active-to-archived transition and deletion of operational
  manager grants;
- Organization audit event when the write changes durable state.

An audit event that claims a managed mutation committed must never be written
outside the transaction that performed that mutation.

Idempotent feature/unfeature no-ops do not manufacture domain audit history
when the feature relation did not change. The internal serialization fence is
implementation metadata, not product history.

## Error semantics

- `ORGANIZATION_AUTHORITY_STALE`: management epoch/role changed; refresh
  management state and do not blind-retry with the old authority.
- `ORGANIZATION_REVISION_CONFLICT`: Organization profile changed.
- `ORGANIZATION_POST_REVISION_CONFLICT`: Post changed.
- `ORGANIZATION_EVENT_REVISION_CONFLICT`: Event changed.
- `ORGANIZATION_NOT_FOUND`: target deletion/update no longer has a visible
  target where that distinction is part of the contract.

A retry after any conflict starts from a fresh service precheck and therefore
captures a fresh authority epoch.

## Tests

The Mongo store tests explicitly prove:

- archive checks current owner authority/revisions, revokes manager grants, and
  writes the archive audit in the same transaction without deleting shared
  content;
- separate-collection managed writes take the Organization write fence before
  the target mutation, forcing serialization against archive;
- changed `managementRevision` before commit -> no target write and no audit;
- actor role revoked before commit -> no target write and no audit;
- valid authority -> target write and audit execute inside the same transaction.

Service tests additionally prove the stable
`ORGANIZATION_AUTHORITY_STALE` API-domain error mapping.

## Rule for future managed Organization features

Do not add a new raw store mutation and call it after `requireRole()`.

Instead:

1. add a typed mutation kind to `AuthorizedOrganizationMutation`;
2. implement it inside `commitAuthorizedMutation()`;
3. perform its state precondition and write inside the transaction;
4. add the matching audit event when the mutation changes durable state;
5. add stale-authority + success tests.
