# Academic Graph v1 — implementation contract

## Status

Implemented in the 2026 backend as the first production-shaped Academic Graph/Catalog slice.

The implementation deliberately separates:

1. public/domain semantics;
2. application invariants;
3. persistence adapter.

The current adapter uses MongoDB/Mongoose because that is the repository runtime today. The application layer depends on the `AcademicStore` port, not directly on Mongoose. A later DER produced/reconciled through NotebookLM may change collections, cardinalities or the database without redefining the HTTP/domain contract unless the product semantics themselves change.

## Domain covered

The v1 catalog supports:

- Country;
- Institution;
- optional Campus/Sede;
- optional AcademicUnit/Faculty/School;
- Program/Career;
- Curriculum/Plan;
- Subject;
- optional CourseOffering.

The hierarchy is not a mandatory fixed-depth tree.

Current parent rules are intentionally conservative:

| Kind | Allowed parent |
| --- | --- |
| Country | none |
| Institution | Country |
| Campus | Institution |
| AcademicUnit | Institution or Campus |
| Program | Institution, Campus or AcademicUnit |
| Curriculum | Program |
| Subject | Program and/or Curriculum |
| CourseOffering | Subject |

A Subject is the only v1 catalog node that may have more than one parent. This preserves the real possibility that one subject participates in more than one plan without duplicating its product identity.

These rules are application-level guards, not a claim that the future DER must use the same physical shape.

## Stable identity

Every canonical catalog node has a product UUID independent from:

- display name;
- alias;
- source URL;
- upstream code;
- Mongo ObjectId.

Renames preserve the UUID.

A duplicate merge never hard-deletes the source ID. The source node becomes `merged` and points to the surviving canonical ID through `redirectToId`.

Redirect identity is applied beyond direct node lookup:

- child discovery expands the canonical parent to bounded merged-source IDs;
- graph ancestry resolves merged parents before evaluating membership;
- new writes canonicalize supplied merged IDs;
- affiliation and SubjectParticipation projections return canonical catalog IDs while preserving the stored historical relation.

Catalog reads resolve redirect chains with:

- loop detection;
- bounded maximum depth;
- invalid-redirect failure;
- explicit `resolvedFromId` in the response.

## Provenance

Every canonical node stores bounded provenance:

- authority tier A/B/C/D;
- `sourceKey`;
- `sourceUrl`;
- optional source-scoped `externalId`;
- optional source-observed name;
- optional fingerprint;
- optional verification timestamp.

`(sourceKey, externalId)` is unique when an external ID exists.

External IDs are never public product identity.

## Catalog lifecycle

Catalog nodes use:

- `active`;
- `inactive`;
- `merged`.

There is intentionally no public/admin hard-delete endpoint.

That prevents an administrative cleanup from corrupting historical affiliations, resource references or URLs.

Canonical writes use optimistic concurrency with `revision`.

A stale writer receives `ACADEMIC_REVISION_CONFLICT`.

## Catalog authorization

Reading canonical catalog data is public.

Writing canonical catalog data requires:

1. a live authenticated AuthSession;
2. an active account;
3. the explicit platform permission `academic:catalog:write`.

This permission is stored separately from the rescued scalar `User.role`.

Academic facts such as student, alumni, teacher or mentor status never imply catalog administration authority.

## AcademicAffiliation

Academic membership is not stored as one `career_id` on User.

An account may have multiple concurrent or historical `AcademicAffiliation` records.

An affiliation has:

- Institution;
- optional Campus;
- optional AcademicUnit;
- optional Program;
- optional Curriculum;
- status;
- optional coarse start/end period.

Supported statuses:

- applicant;
- active;
- paused;
- completed;
- withdrawn;
- alumni.

The server verifies that all selected contextual nodes descend from the same Institution.

If both Program and Curriculum are supplied, the Curriculum must descend from that Program.

## SubjectParticipation

A user can record a relation to a canonical Subject and optionally one concrete CourseOffering.

Supported states:

- planned;
- current;
- completed;
- dropped.

When a CourseOffering is supplied, the server verifies that it descends from the selected Subject.

The Mongo adapter enforces one record per:

`(userId, subjectId, courseOfferingId)`.

The write operation is idempotent at that semantic key.

## CurrentAcademicContext

Current context is a separate server-side record.

It references:

- one affiliation owned by the acting user;
- optionally one subject participation owned by the same user.

A withdrawn affiliation cannot become current context.

If a SubjectParticipation is selected, its Subject must descend from the most specific available affiliation anchor:

1. Curriculum;
2. otherwise Program;
3. otherwise Institution.

A client-supplied ID never bypasses server ownership or graph validation.

## Missing-data proposal

Authenticated users can propose missing academic data without creating canonical truth.

A proposal begins as `pending`.

Public proposal submission does not:

- create a canonical node;
- grant catalog-write permission;
- mark the entity verified;
- alter a canonical alias;
- merge any node.

Canonicalization remains an administrative workflow.

Admin review closes the proposal lifecycle:

`pending -> accepted | rejected | duplicate | superseded`

For accepted/duplicate/superseded outcomes, the reviewer must identify an already-existing active canonical node of the same kind. Rejected proposals cannot claim a canonical target. The transition is conditional on `pending`, so retries/concurrent reviewers cannot overwrite the first decision.

## Audit

The adapter persists append-only academic audit events for:

- catalog create;
- catalog update;
- catalog merge;
- affiliation create/update;
- subject participation upsert;
- current context update;
- missing-data proposal create/review.

A successful mutation and its audit event execute inside the same `AcademicStore.runAtomically` unit of work. The Mongo adapter implements that boundary with a real Mongo transaction, preventing a successful domain mutation from committing without its required audit event.

The audit records actor, target, event time and bounded metadata.

## Mongo adapter v1

The current physical collections are:

- `academic_catalog_nodes`;
- `academic_affiliations`;
- `academic_subject_participations`;
- `academic_current_contexts`;
- `academic_catalog_proposals`;
- `academic_audit_events`.

These names are adapter details.

Academic write paths require transaction-capable Mongo. The local/CI runtime starts a one-node replica set specifically so transactional behavior is exercised instead of mocked.

A future DER may split/merge/restructure them. Code outside `apps/api/src/academic/mongo` must not depend on those physical names or Mongoose document shape.

## Tests and gates

The module has:

- unit tests for positive and negative domain invariants;
- explicit admin-permission guard tests;
- critical Academic Graph coverage gate;
- full repository quality gate;
- runtime smoke against a real Mongo container;
- runtime verification of durable academic audit records;
- Auth regression gate running independently.

The runtime smoke uses synthetic academic data only. It proves the implementation lifecycle; it does not claim that a real launch university/program has been selected.

## DER reconciliation rule

The future NotebookLM DER is allowed to change the physical model.

When it arrives:

1. map DER entities/cardinalities against this implemented behavior;
2. identify semantic conflicts versus merely physical differences;
3. preserve stable public IDs and HTTP semantics where possible;
4. replace/extend the `AcademicStore` adapter;
5. migrate data with explicit rollback;
6. update this document and ADR 0004.

Do not rewrite working business rules solely to mimic a diagram if the diagram contradicts an already accepted product invariant without an explicit product decision.
