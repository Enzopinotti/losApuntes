# ADR 0004 — Replaceable transactional persistence before/after DER reconciliation

- Status: Accepted interim, explicitly revisable by the NotebookLM DER
- Date: 2026-09-22
- Revised: 2026-09-23

## Context

The rescued backend runs on MongoDB/Mongoose.

The 2026 product requires substantially richer relational semantics than the rescued User document: temporal academic affiliations, canonical catalog identity, aliases/provenance, provisional proposals, SubjectParticipation, current context, merge/redirect semantics and later resources/social relationships.

The project decision is now to continue building domain slices before the final NotebookLM DER is produced, while making those slices cheap to remodel afterward.

Waiting for the diagram would unnecessarily block product progress. Hard-coding Mongoose throughout the application would create the opposite problem.

## Decision

Use a **replaceable persistence boundary**.

For the current runtime:

- MongoDB/Mongoose remains the concrete transactional adapter;
- new domain application services depend on explicit store/port contracts;
- persistence-specific models and queries stay inside adapter folders;
- public IDs are product IDs, never Mongo ObjectIds;
- business rules cannot depend on collection names or Mongoose document behavior;
- migrations/reconciliation after the NotebookLM DER are expected and supported.

For Academic Graph v1 the boundary is `AcademicStore`.

This is an interim persistence implementation decision, not a declaration that MongoDB is the permanent product database.

## Why this is acceptable before the DER

The costly part to change later is not a collection name. It is business logic coupled to persistence assumptions.

The implementation therefore freezes only product semantics already required by the 2026 contract:

- stable IDs;
- flexible optional hierarchy;
- historical/multiple affiliations;
- Subject distinct from CourseOffering;
- canonical versus provisional state;
- merge redirects;
- provenance;
- server-authoritative current context;
- explicit authorization;
- auditability.

The future DER may reorganize how those facts are stored.

## Current Mongo adapter

Identity/Auth already uses Mongo-backed stores.

Academic Graph v1 adds Mongo adapters for:

- catalog nodes;
- affiliations;
- subject participation;
- current context;
- proposals;
- audit events.

Application code outside the Mongo adapter must not import those schemas.

## Future DER reconciliation

When NotebookLM produces the real DER/class model, compare it against:

- `docs/domain/domain-contract-2026.md`;
- `docs/domain/academic-graph-implementation-v1.md`;
- runtime workloads;
- already-shipped HTTP semantics.

Classify every difference as one of:

1. physical-only representation change;
2. cardinality/integrity improvement compatible with current semantics;
3. genuine product-semantic conflict.

Only category 3 requires an explicit product decision.

## Database choice after the DER

PostgreSQL remains a serious candidate if the DER/workloads show that relational integrity, joins, temporal queries and many-to-many behavior justify migration.

MongoDB may remain if the resulting model and operational evidence support it.

Hybrid persistence is rejected unless one concrete workload demonstrates a benefit worth the operational cost.

No database gets selected by preference alone.

## Required properties of any replacement

A future adapter/migration must preserve:

- stable product IDs;
- source-scoped external IDs;
- no silent duplicate canonicalization;
- redirects after merge;
- user ownership isolation;
- historical affiliations;
- current-context validation;
- Auth credential/session race guarantees;
- durable audit where required;
- explicit schema/data migration with rollback.

## Migration discipline

A later physical migration must provide:

1. target schema and constraints;
2. deterministic mapping from current product UUIDs;
3. data backfill plan;
4. verification queries;
5. dual-read/write only if demonstrably required;
6. cutover plan;
7. rollback plan;
8. post-cutover cleanup plan.

Do not use the future DER as justification for a flag-day rewrite.

## Rejected alternatives

### Block all product work until the DER exists

Rejected.

The project explicitly chooses module-by-module implementation first, with later physical reconciliation.

### Treat the current Mongo shape as permanent

Rejected.

Mongo is an adapter, not domain truth.

### Put temporary `career_id` academic state back on User

Rejected.

It encodes the wrong cardinality and breaks history/multiple-affiliation semantics.

### Add PostgreSQL alongside Mongo before evidence

Rejected.

It creates two operational systems before the DER provides a concrete reason.

## Consequences

Positive:

- development can continue now;
- NotebookLM can still reshape the persistence model later;
- HTTP/client contracts remain stable;
- testable invariants survive adapter replacement.

Trade-off:

- a future DER may require a non-trivial data migration;
- adapter boundaries add code now;
- some physical constraints are enforced at application + Mongo-index level until a future database decision.

That trade is accepted.
