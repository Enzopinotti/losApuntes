# ADR 0007 — Resource authority over claimed FileAsset lifecycle

**Status:** Accepted for the current Files/Resources model  
**Date:** 2026-10-04  
**Issue:** #182  
**Parent lifecycle audit:** #82

## Context

Los Apuntes now has two authority-shutdown flows that deliberately preserve
shared history:

- account closure closes authentication authority and tombstones public
  identity without deleting shared Resources;
- Organization archive removes active Organization/manager authority without
  deleting referenced Resources or their bytes.

That makes destructive storage work unsafe until the relationship between
Resource, FileAsset, authorship and object-storage bytes is explicit.

The current implementation already has a strong v1 topology:

- `Resource.assetId` is unique;
- `FileAsset.claimRef` is unique when present;
- Resource creation atomically changes an owned, clean `ready` FileAsset from
  `claimRef = null` to `claimRef = resource:<resourceId>` and removes its
  upload-expiry marker;
- abandoned-upload cleanup can only claim unclaimed reclaimable FileAssets;
- a Resource author and FileAsset creator are recorded as user attribution,
  while Organizations can only reference/feature an authorized Resource.

Without a written lifecycle authority, fields such as `creatorUserId`,
`authorUserId` or an Organization reference could be misread later as a
license to delete bytes.

## Decision

### 1. Resource is lifecycle authority for a claimed v1 FileAsset

Once a FileAsset has been claimed by a Resource, the Resource relationship is
the product-level reason those bytes remain durable.

A claimed FileAsset is not eligible for the abandoned-upload cleanup path.

Releasing or destroying those bytes requires a future explicit Resource
lifecycle transition. Account status, Profile status, Organization status and
a stale UI reference are not substitutes for that transition.

### 2. Creator and author fields are provenance, not byte ownership

`FileAsset.creatorUserId` records who created the upload lifecycle.

`Resource.authorUserId` records current Resource authorship under the v1
product model.

Neither field independently grants a deletion capability over object-storage
bytes. Closing or later anonymizing a user must not implicitly unclaim a
FileAsset or delete a Resource that remains part of shared academic history.

### 3. Organization references never own Resource bytes

Featured Resources and other Organization references point at Resource
identity. They do not transfer Resource ownership, FileAsset claims or storage
authority.

Archiving or later purging an Organization therefore cannot make a referenced
FileAsset purgeable merely because that Organization referenced it.

### 4. Current cardinality is one Resource to one claimed FileAsset

For v1 the persistence adapter intentionally enforces one-to-one cardinality:

- one Resource has one `assetId`;
- that `assetId` is unique across Resources;
- one non-null `FileAsset.claimRef` is unique;
- Resource creation writes `resource:<resourceId>` as the claim.

Do **not** add a generic refcount while this cardinality remains true. A
refcount of one would duplicate existing authority without adding safety.

If later work introduces asset reuse, derived assets, co-owned binary objects,
multiple active asset versions, or another domain that can retain the same
bytes, that change requires a new reference model, migration and updated purge
algorithm before destructive behavior ships.

### 5. Upload cleanup and Resource purge are separate state machines

The Files worker may continue reclaiming expired **unclaimed** assets using its
durable `reclaiming -> reclaimed` lifecycle.

A claimed asset requires a different future sequence. At minimum that sequence
must define:

1. the Resource lifecycle state that stops normal authorization/discovery;
2. the durable condition that releases the Resource/FileAsset relationship;
3. legal/product retention requirements;
4. treatment of reports/audit/history and dependent references;
5. object-storage deletion retry/idempotency semantics;
6. recovery/backup implications.

This ADR deliberately does not choose those later states or durations.

### 6. Object deletion is not equivalent to complete erasure

Production recovery sets may retain Mongo/File bytes according to #100 and
launch/legal policy in #48.

A future object delete may truthfully mean “removed from the live object
store” only. It must not promise deletion from backups until an operationally
verified backup-retention/purge contract exists.

## Verification invariants

The current adapter must keep evidence that:

- `Resource.assetId` is uniquely indexed;
- non-null `FileAsset.claimRef` is uniquely indexed;
- Resource creation claims only an unclaimed, clean, ready asset owned by the
  actor;
- the claim value is tied to the Resource id and upload expiry is removed;
- abandoned cleanup never reclaims a claimed FileAsset.

Changing any of these is an architectural change, not a persistence cleanup.

## Consequences

### Positive

- future account/Organization lifecycle code cannot infer byte deletion from
  identity ownership;
- Resource deletion can be designed independently from abandoned-upload
  cleanup;
- the current simple 1:1 model stays simple instead of gaining speculative
  reference counters;
- backup erasure claims stay honest.

### Costs

- hard Resource deletion remains intentionally unavailable until retention and
  dependent-reference semantics are designed;
- any future asset-sharing/reuse feature must introduce an explicit migration
  away from this 1:1 assumption.

## Rejected alternatives

### Delete all FileAssets created by a closing account

Rejected. Creator identity is provenance, and claimed Resources may remain
shared historical product objects.

### Delete bytes when an Organization is archived or purged

Rejected. Organizations reference Resources but do not own their FileAssets.

### Add a refcount now

Rejected. The current persistence model already enforces one Resource ↔ one
claimed FileAsset. A counter would be redundant and create synchronization
failure modes without representing a second real reference.

### Treat object-store deletion as GDPR/legal erasure

Rejected. Live storage and backups have distinct operational lifecycles. Legal
erasure semantics require the separate retention/backup decision tracked by
#82/#48/#100.
