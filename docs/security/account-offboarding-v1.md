# Account offboarding v1

Parent: #82  
Related launch/legal gate: #48

## Boundary

Account closure is authority shutdown, not hard deletion or anonymization.

A closed account cannot authenticate or use an existing session. Its credential version advances in the closure transaction. Shared Resources, Q&A, Academic/Alumni history and other attributed contributions are not hard-deleted by this carrier.

The stable Profile id is retained for referential meaning, while public identity becomes a generic tombstone.

No legal retention horizon is invented here.

## Self-service preconditions

The caller must have a current active AuthSession.

Password-backed accounts must prove the current password again. Provider-only destructive reauthentication is intentionally unsupported until a reviewed provider reauth contract exists.

The account must hold no Organization management role. Preflight returns at most 20 blockers plus an honest truncation flag. The actual closure transaction rechecks for any management row and does not trust the preflight result.

## Atomic closure boundary

One Mongo transaction:

1. rechecks that no Organization manager row exists;
2. compare-and-swaps active account plus expected credential version;
3. sets account status to closed and records closure time;
4. sets credential version to expected + 1, including legacy effective version 1;
5. marks the Profile lifecycle closed when a Profile exists;
6. creates a durable offboarding cleanup job with its own UUID;
7. appends the account.closed security audit row.

Organization manager creation/change writes an active-User authority fence inside its own transaction. This shares a User document write boundary with closure, so a concurrent grant cannot silently cross the closure transaction.

First Profile creation also runs in a transaction and increments a separate hidden account-lifecycle revision on the same User document before inserting the Profile. If creation wins the User write first, closure retries/serializes against it and tombstones the new Profile before committing. If closure wins first, Profile creation's active-User fence no longer matches and the insert fails closed. The `POST /profile/me` request returns the existing `ACCOUNT_RESTRICTED` response for this in-flight case.

Revocation of an Organization manager remains allowed for inactive targets so stale management can be removed.

## Public identity

Closed Profiles are omitted from People search and public Profile/activity reads. Historical attribution returns the stable profile id with display name "Usuario de Los Apuntes" and no avatar.

This carrier does not delete Resources, Questions, Answers, organization posts/events, academic affiliations or alumni history.

For Files specifically, `FileAsset.creatorUserId` is upload provenance, not
destructive ownership. If a FileAsset has been claimed by a Resource, closing
the creator account does not release `claimRef` and does not make the object
eligible for abandoned-upload cleanup. The Resource/FileAsset lifecycle
authority and current one-to-one cardinality are defined by ADR 0007.

## Durable cleanup

The existing background worker processes durable offboarding jobs independently from file scanning.

Cleanup revokes:
- all AuthSession rows;
- all email-verification tokens;
- all password-recovery tokens.

Jobs use a claim/lease, bounded exponential retry and a terminal failed state. Terminal cleanup failures keep worker health not-ready until repaired; they cannot reactivate the already-closed account.

Scanner failure does not prevent account cleanup from running when core dependencies are healthy.

## Durable audit

The initial append-only security_audit event is account.closed. It stores generated ids, actor/subject user ids, server time and bounded metadata identifying self-service source and cleanup job.

Passwords, raw tokens, token hashes, cookies, email bodies, arbitrary request bodies and file contents are forbidden.

Existing logger-only Auth audit events are not retroactively described as durable.

## Explicit non-goals

This carrier does not choose hard-delete/anonymization policy, retention horizons, backup purge promises, export semantics, Organization archive/purge semantics or provider-only destructive reauthentication.
