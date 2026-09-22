# ADR 0004 — Choose transactional persistence after DER reconciliation

- Status: Proposed — blocked on real DER/class diagrams
- Date: 2026-09-22
- Tracks: #3

## Context

The rescued backend currently runs on MongoDB/Mongoose.

Historical Los Apuntes material also named MongoDB Atlas and described a high-level academic hierarchy, but it explicitly left detailed technical modeling for later design.

The accepted 2026 domain contract is substantially richer than the rescued physical model. It requires temporal academic affiliations, canonical catalog identity, scoped aliases/provenance, provisional-to-canonical transitions, subject participation, catalog merge/redirect semantics, profile/privacy separation, resources/assets and several many-to-many relationship types.

The repository intentionally does not yet contain the real DER/class diagrams that issue #3 requires.

Selecting a database before those diagrams are reconciled would turn a provisional implementation detail into architecture.

## Current decision

**Do not choose or migrate the primary transactional database yet.**

Until the DER is reconciled:

- MongoDB/Mongoose remains the runtime persistence adapter for the already-working Account/Auth foundation;
- no new Academic Graph physical model may treat Mongo as permanent by default;
- PostgreSQL remains a serious candidate, not a predetermined winner;
- hybrid persistence is not selected without a concrete workload;
- public Auth semantics remain persistence-independent.

The detailed evidence and migration surface are documented in:

`docs/architecture/persistence-preflight-2026.md`

## Decision criteria for the final revision

The accepted persistence decision must use the reconciled DER/workloads to compare at least:

- referential integrity;
- scoped uniqueness/dedup;
- temporal/history queries;
- many-to-many graph behavior;
- canonical merge/redirect workflows;
- transaction boundaries;
- schema evolution/migrations;
- indexing/search projections;
- developer velocity;
- local/CI reproducibility;
- backup/restore/rollback;
- migration cost from the current Auth runtime.

## Invariants independent of the winner

The selected persistence model must preserve:

- stable product identifiers independent of display names;
- multiple simultaneous/historical academic affiliations;
- server-authoritative current context;
- canonical/provisional separation;
- auditability of sensitive state transitions;
- Auth credentialVersion/session/action-token race guarantees;
- no storage-specific identifier as public authorization authority.

## Why no decision is recorded yet

The current repository evidence proves two things simultaneously:

1. MongoDB is a functioning adapter for the present Account/Auth slice.
2. The future product has relational/integrity pressure that the tiny current schema cannot meaningfully evaluate.

Without real cardinalities and lifecycle semantics from the DER, a Mongo-vs-PostgreSQL verdict would be preference dressed as architecture.

## Rejected premature alternatives

### Declare MongoDB permanent because it already works

Rejected for now.

Existing Auth behavior proves operability for Auth, not suitability for the Academic Graph.

### Migrate immediately to PostgreSQL because the future graph looks relational

Rejected for now.

The direction may ultimately be correct, but migration before diagram/workload reconciliation creates cost without a validated physical target.

### Use both MongoDB and PostgreSQL from day one

Rejected.

This adds consistency, deployment, backup, testing and operational complexity before a concrete workload justifies it.

## Trigger to revise this ADR

Revise this ADR when the real DER/class diagrams are available and the reconciliation checklist is complete.

The revision must record:

- final chosen persistence model;
- physical ID conventions;
- migration/versioning tool;
- constraint/index strategy;
- transaction policy;
- search/projection boundary;
- migration plan for current User/Auth data;
- rollback strategy;
- rejected alternatives with evidence.

Until then, this ADR's architectural decision is intentionally **defer the database choice while preserving replaceable persistence boundaries**.
