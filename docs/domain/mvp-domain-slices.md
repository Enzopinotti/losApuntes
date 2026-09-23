# MVP domain slices and delivery order

This document defines implementation slices while keeping physical persistence replaceable.

## Slice 0 — Runtime foundation

Status: complete.

Includes workspace hygiene, quality/audit gates, hardened HTTP runtime, liveness/readiness and reproducible container smoke.

## Slice 1 — Identity and session contract

Status: backend/Web code-complete.

Includes Account authority, revocable Session, verification/recovery, Google login-method lifecycle, account status, security settings and shared Web/Mobile auth semantics.

Native Mobile implementation and public production evidence are separate delivery concerns.

## Slice 2 — Canonical academic catalog + affiliation/context

Status: backend implementation complete in Academic Graph v1.

Implemented concepts:

- Country;
- Institution;
- optional Campus;
- optional AcademicUnit;
- Program;
- Curriculum;
- Subject;
- optional CourseOffering;
- aliases/provenance/redirects;
- provisional proposal;
- AcademicAffiliation;
- SubjectParticipation;
- CurrentAcademicContext.

The application uses an `AcademicStore` persistence boundary. The current Mongo adapter is explicitly replaceable after NotebookLM DER reconciliation.

The slice intentionally does not use `career_id` on User as domain authority.

## Slice 3 — Living profile

Next product slice after Academic Graph.

Depends on Identity plus canonical academic identity.

Initial profile work should consume `CurrentAcademicContext`/affiliations rather than recreating academic fields in the client.

## Slice 4 — Resources / Notes

Depends on authenticated principal, Academic Graph and storage authorization.

Required concepts include Resource, ResourceAsset/upload intent, authorship, academic context, visibility, save/bookmark and moderation state.

## Slice 5 — Search and contextual discovery

Build deterministic/scoped discovery over canonical product data.

Search remains a projection/indexing concern and does not redefine canonical ownership.

## Slice 6 — Social + lightweight Q&A

Follow/Connection semantics, Question/Answer, Report and essential notifications.

Academic proximity remains separate from social consent.

## Slice 7 — Contextual Home

Rule-based first Home over current subjects, resources, questions, people and followed sources.

## Slice 8 — Organizations and alumni lifecycle

Organization management, memberships/follows, alumni/mentor transitions and events.

The AcademicAffiliation model already preserves history/multiple affiliations needed for this expansion.

## Slice 9 — Opportunities and professional discovery

Post-core product with explicit professional visibility opt-in and source/sponsorship boundaries.

## Implementation dependency graph

```text
Runtime foundation
      |
      v
Identity/session
      |
      v
Academic catalog/context
      |
      +-----> Profile
      |
      v
Resources/Notes
      |
      v
Search/discovery
      |
      v
Social/Q&A
      |
      v
Contextual Home
      |
      +----> Organizations/alumni
      |
      +----> Opportunities

NotebookLM DER reconciliation can revise persistence underneath these slices.
```

## DER rule

The DER is no longer a blocker for application-level module delivery.

Safe approach:

- implement domain behavior behind ports;
- keep storage-specific code isolated;
- use stable product IDs;
- write invariants/tests first;
- reconcile physical model later.

Still prohibited:

- treating current Mongo collections as immutable architecture;
- exposing Mongo ObjectIds as product identity;
- duplicating catalog truth in Web/Mobile;
- encoding one current career directly on User as the new model;
- skipping a future migration plan when the DER changes persistence.

## Definition of slice completion

A slice is not complete because models/controllers exist.

Each implemented slice should have:

- domain invariants encoded in tests;
- backend authorization tests including negative cases;
- stable API contract;
- Web/Mobile-consumable semantics;
- persistence/migration boundary;
- degraded/error behavior;
- exact-head CI evidence;
- runtime smoke coverage when behavior crosses process/database/storage boundaries.
