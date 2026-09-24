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

Status: complete in Profile v1 across API and Web.

Profile consumes `CurrentAcademicContext`/affiliations from Academic Graph rather than recreating academic fields in the client. Native Mobile remains a separate client delivery concern.

## Slice 4 — Resources / Notes

Status: complete in Files + Notes v1 across storage, API/domain, Web and runtime operations.

Implemented concepts include Resource, ResourceAsset/upload intent, authorship, canonical academic context, privacy/share grants, save/bookmark, reporting, moderation-aware reads, private S3-compatible storage and abandoned-upload cleanup.

## Slice 5 — Search and contextual discovery

Status: complete in Search + contextual discovery v1.

Deterministic/scoped discovery is implemented over current Resource, Academic and public Profile authorities. Search remains a projection/read concern and does not redefine canonical ownership or introduce hidden feed/recommendation scoring.

## Slice 6 — Social + lightweight Q&A

Status: complete in Social + Q&A v1.

Follow/Connection semantics, Question/Answer, Report and essential notifications are implemented without redefining academic proximity as social consent. Messaging, block/mute and generalized reactions remain separate post-core decisions.

## Slice 7 — Contextual Home

Status: complete in Feeds v1 and Pilot Operations v1.

Academic Feed and For You are bounded, explainable projections with privacy eligibility before ranking, visible reasons, feedback controls, diversity constraints and a natural stop. Pilot Home adds operationally testable contextual continuity without using attention maximization as an objective.

## Slice 8 — Organizations and alumni lifecycle

Status: core v1 complete across Campus Organizations v1 and Alumni lifecycle v1.

Organization identity is separate from Institution. Organization managers, claims/verification state, follows, posts/events/links, featured Resources and moderation are implemented. Alumni lifecycle preserves multi-affiliation history, audited graduation, roles, Institution/Program continuity follows, Home/feed continuity and pilot cohort metrics.

Automated legal verification, RSVP/calendar sync, organization chat, paid promotion, diploma/registry verification, recent-graduate expiry and native Mobile acceptance remain explicit later concerns.

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

A slice is not complete because models/controllers exist, because a PR merged, or because an older SHA was green.

Each implemented slice should have:

- domain invariants encoded in tests;
- backend authorization tests including negative cases;
- stable API contract;
- Web/Mobile-consumable semantics;
- persistence/migration boundary;
- degraded/error behavior;
- exact-head CI evidence;
- runtime smoke coverage when behavior crosses process/database/storage boundaries;
- review findings reconciled before merge;
- merged-main/post-merge evidence before documentation is promoted to Implemented/Validated;
- planning-ledger reconciliation using the stable external key and requirement IDs.
