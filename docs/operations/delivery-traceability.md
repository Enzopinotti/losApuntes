# Delivery traceability and closure

This document defines the delivery procedure that connects product requirements, the project planning ledger and GitHub evidence without creating competing sources of truth.

## Authorities

- The project spreadsheet is the planning ledger for current/future work, status, comments and migration into TOP Tasks.
- Product/functional, architecture/security and delivery requirements remain in their canonical project documents.
- GitHub is authoritative for code, PR/review state, exact SHAs and workflow evidence.
- Completion matrices summarize proven implementation; they do not replace the planning ledger or CI evidence.

The repository must reference planning identifiers, not mirror the full backlog.

## Stable traceability chain

Every coherent work item should be recoverable through:

`requirement_ids -> external_key -> issue/PR -> candidate SHA -> exact-head verify -> merge SHA -> post-merge verify -> planning ledger POST`.

Required planning identifiers:

- `external_key`: stable task identity, never recycled;
- `requirement_ids`: one or more canonical requirement IDs when the work implements or changes specified behavior;
- GitHub issue/PR URL when a carrier exists;
- exact candidate SHA and workflow run;
- merged `main` SHA;
- post-merge run when the work is claimed as Implemented/Validated.

Machine status/priority enums remain canonical for TOP compatibility. Human-readable task/comment text prepared for TOP is written in Spanish.

## Work lifecycle

### 1. PRE — register before implementation

Before mutating GitHub:

1. reconcile remote `main`, the relevant branch/PR and existing review state;
2. register the intended action in the project spreadsheet work log;
3. identify the external key(s), requirement ID(s), scope, non-goals and expected evidence;
4. avoid reopening a completed carrier when a new coherent carrier is clearer.

If there is no PRE record, the work is not considered governed work.

### 2. Implement one coherent carrier

Prefer logical commits over commit inflation.

The carrier must preserve:

- backend authority and domain invariants;
- client contract parity when API behavior changes;
- persistence boundaries;
- negative/security paths where relevant;
- explicit degraded/error behavior.

Valid review findings become explicit work. A green run does not override an unresolved correct review.

### 3. Exact-head verification

Verification belongs to the exact candidate SHA.

Record:

- candidate SHA;
- workflow run ID;
- relevant job ID/marker when a specific runtime behavior matters;
- any external/manual gate that CI cannot prove.

Never certify a changed HEAD with an older green run.

### 4. Review and merge

Before merge:

- answer and resolve valid review threads;
- reconcile the PR body with the final candidate;
- confirm the PR is mergeable against current `main`;
- use an expected-head guard when merging if available.

The merge result SHA must be recorded.

### 5. Post-merge verification

When behavior crosses a verified application/runtime boundary, run/reconcile CI on the merged `main` SHA.

A candidate can be code-complete while still not being production-ready or externally validated. Preserve that distinction in the ledger.

### 6. POST — close or re-open honestly

After each meaningful action, update the spreadsheet with:

- result;
- SHA/run/PR evidence;
- blocker or review finding;
- next action.

A task moves to `done` only when its own closure criterion is satisfied. If review or runtime evidence exposes a gap, re-open the task instead of weakening the claimed evidence.

### 7. Documentation promotion

Promote documentation/completion matrices to Implemented/Validated only when the evidence they claim exists.

For a product slice this normally means:

- implementation merged;
- candidate exact-head green;
- post-merge main green where required;
- review findings resolved;
- runtime evidence for cross-process/database/storage behavior;
- planning ledger reconciled.

## Closure review checklist

Before declaring a block closed:

- [ ] External key(s) and requirement ID(s) are present.
- [ ] PRE and POST entries exist in the spreadsheet work log.
- [ ] Candidate SHA/run are exact and recorded.
- [ ] Valid review findings are resolved or explicitly carried forward.
- [ ] Merge SHA is recorded.
- [ ] Post-merge evidence is recorded when applicable.
- [ ] Documentation matches the real state and does not overclaim evidence.
- [ ] Future/non-goal work is preserved as explicit backlog rather than hidden.
- [ ] TOP-visible human text is in Spanish.
- [ ] No task was duplicated between Backend and Frontend ledgers.

## What not to do

- Do not infer completion from an issue being closed.
- Do not use chat history as the only record of a technical decision.
- Do not duplicate the spreadsheet backlog into GitHub labels/issues purely for status tracking.
- Do not mark external provider/production gates complete with local evidence.
- Do not weaken a test, matrix or closure claim merely to obtain green CI.
- Do not reuse a stale SHA as release evidence.
