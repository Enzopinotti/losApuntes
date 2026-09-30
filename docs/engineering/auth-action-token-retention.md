# Auth action-token bounded retention

**Canonical issue:** #88

## Problem

Action-token issuance already had a product invariant:

- at most 3 active tokens per account and purpose.

However, the old implementation enforced that invariant by loading **all**
active tokens for the user/purpose into Node, sorting them, and invalidating the
tail.

That made the enforcement path itself depend on unbounded active-history
cardinality.

## Retention primitive

The service now delegates to:

`retainNewestActiveForUserPurpose(userId, purpose, now, keep)`

with `keep = 3`.

Mongo performs two bounded/server-side operations:

1. query only the newest 3 active token IDs;
2. `updateMany` every other active token for that user/purpose and mark it
   consumed.

The application never materializes the overflow set.

## Ordering

Retention order is stable:

1. `createdAt DESC`;
2. `tokenId DESC` as deterministic tie-breaker.

The active-token index is aligned with:

- userId;
- purpose;
- consumedAt;
- expiresAt;
- createdAt;
- tokenId.

## Why not limit+1

The system is not presenting a page or asking whether overflow exists. Its goal
is to **repair the invariant**.

Fetching only 4 rows would detect overflow but would clean at most one old
token per issuance. Historical drift could therefore remain above the cap.

Keeping the top 3 IDs and invalidating everything outside that set repairs any
amount of drift in one server-side bulk update while keeping the read bounded.

## Security semantics

No bearer token is returned by the retention query.

The cleanup remains scoped to:

- one user;
- one purpose;
- unconsumed tokens;
- unexpired tokens.

Expired tokens continue to be handled by their TTL/index lifecycle and are not
part of the active-token cap.

Issuance cooldown and unique issue buckets are unchanged.

## Regression evidence

Required:

- service delegates retention only after successful issuance;
- concurrent bucket loss does not invoke retention;
- Mongo query uses `limit(3)`;
- Mongo query selects only `tokenId`;
- Mongo cleanup uses `$nin` over the retained IDs;
- empty retained set remains fail-safe and bounded;
- existing Auth critical coverage remains green;
- existing Auth runtime smoke remains green.
