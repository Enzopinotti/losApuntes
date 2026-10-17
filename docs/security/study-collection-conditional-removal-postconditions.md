# Conditional study-collection reference recovery — authoritative postconditions

## Discovery

A failed resource-detail read (404 / 403) is the **only** reason that an owner may conditionally prune an inaccessible saved-reference link. The client supplies the current collection revision. The server checks owner scope and that the reference existed, then uses a Mongo compare-and-set update. Normal user-driven removal without a conditional expected revision is unchanged.

The existing B57 contract test exposed a real false-positive: the mock Mongo update returned a collection with the correct incremented revision, but `resourceIds` still contained the supposedly removed resource. The service treated revision increment alone as proof that cleanup succeeded, and incorrectly returned success. The API thus risked telling the owner that an inaccessible reference had been removed when it was still present.

## Correct handling

A conditional remove succeeds **only if all postconditions hold**:

1. The caller owns the collection and current revision equals `expectedRevision`.
2. The reference is present and a current Resource GET confirms the resource is no longer accessible (403/404). Other errors never authorize cleanup.
3. The storage update returns an owned collection whose revision is exactly `expectedRevision + 1`.
4. The returned collection's `resourceIds` **does not contain** the removed reference.
5. A null CAS result is not automatically 404: recheck owner scope. If collection still exists for that owner, report `STUDY_COLLECTION_REVISION_CONFLICT`; if missing/foreign, preserve not-found semantics.

These additional validations are **post-write safety checks**. They do not give the service authority to undo a Mongo mutation. Mongo/store must continue enforcing the compare-and-set condition atomically. Operational monitoring should investigate any store postcondition failure instead of retrying blindly.

## Coverage and privacy

- B57 preexisting regression: incorrect success where revision incremented but target link remained.
- New regression: a null CAS result while owner collection still exists returns revision conflict, not a misleading 404.
- New regression: returned collection lacks link but revision jumped past expected increment; conflict.
- Positive recovery remains tested for both `ForbiddenException` and `NotFoundException`.
- Readable resources still veto cleanup; 5xx/network errors propagate; foreign owner is denied before resource lookup.
- No new endpoint, DB migration, feature flag, cache, dependency or private data in URLs.

## Integration

The separate API baseline formatting PR #349 edits the same domain service and test file **for formatting only**. Preserve both postcondition changes when reconciling its latest branch and re-run the repository's pinned Prettier against the combined content. Do not cherry-pick an old whole-file formatter snapshot over this fix.

The focused `Study conditional removal contracts` workflow checks exact SHA, Jest behavior and API TypeScript. The global quality/security gates remain separately authoritative. Real Mongo replica acceptance is deliberately deferred; the workflow does **not** start the application or Mongo.
