# B49 — Rollback-safe portability for Study Collections

## Verified defect

The B47 export request used only `STUDY_COLLECTIONS_ENABLED` to select its
format. If the flag was enabled, a user created private collections, and the
flag was later disabled, the same account's **new** export job would be v1.
That historical format has exactly 30 sections and cannot include
`study.collections`. The HTTP request could report success while omitting
still-retained private academic data.

## Correct behavior

An authenticated active account's **new** export request selects a format in
this order:

| Feature flag | Existing owner collections | New export version |
| --- | --- | --- |
| ON | Any / not queried | v2, 31 sections |
| OFF | At least one | v2, 31 sections |
| OFF | None | v1, 30 sections |
| OFF | Mongo query fails | Abort request; never issue a v1 job |
| OFF | Reader absent in a configured Nest runtime | Abort request; fail closed |

The owner check calls only `StudyCollectionExportReader.hasOwnedCollections`,
which uses the indexed `Model.exists({ownerUserId})` query, not a complete
read of collection content and not a global collection count.

The check occurs **after** active-account validation and **before**
`AccountExportStore.requestActive`. A v1 job already in progress is not
reused when v2 is required: the API responds 409
`ACCOUNT_EXPORT_LEGACY_JOB_ACTIVE`. All persisted v1 jobs retain their
original v1 format; old artifacts are not re-labelled or rewritten.

## Safety of a rollback

Disabling `STUDY_COLLECTIONS_ENABLED` still denies the persistent CRUD
controller; it does not delete previously saved collections. The export
reader remains available through DataLifecycle even when CRUD is disabled.
The export job v2 therefore remains capable of returning the owner's saved
private collections with their opaque resource IDs, titles, descriptions,
revisions and timestamps. References do **not** grant resource access.

This change protects the case of **data surviving a feature rollback**.
It does not solve a partially coordinated multi-instance rollout where one
API pod enables new writes before other pods know about the new code. Deploy
all API pods and workers with the same version first; coordinate flag updates.

## Tests added

- Reader: owner-only exists lookup, no document materialization, empty owner
  rejection, Mongo failure propagation.
- Account Export Service: v2 after rollback, v1 for empty owner, stale
  active v1 job conflict, miswired reader fail-closed, Mongo error before
  creating any job, opt-in v2 with no extra lookup.
- `scripts/test-account-export-b49-integration.mjs`: invariants based on
  exact source files for rollout flag, owner query, v1/v2 selection, job
  compatibility and version-specific artifact output.

Independent verification in the integration pass executed nine isolated
cases from the actual `requiredExportVersion` method in a JS harness.
Those checks do **not** establish that Nest, Mongoose, TS typechecks, CI,
S3, browser and Mongo replica-set integration pass.

## Release gates (still outstanding)

Execute exact-head Jest tests, Nest API typecheck and build, account export
worker E2E against Mongo/S3, a multi-pod rollback scenario, 409 reuse when
a v1 job is processing, and account closure followed by owner query.
Preserve the existing disabled-by-default persistent CRUD flag.

**Code integration is not approval for production activation.**
