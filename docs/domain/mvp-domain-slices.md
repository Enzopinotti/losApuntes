# MVP domain slices and delivery order

This document defines implementation slices without selecting a physical database.

The purpose is to avoid two opposite failures:

- implementing every future concept before validating the MVP;
- implementing an underspecified shortcut that makes Profile, Academic Graph or Resources impossible later.

## Slice 0 — Runtime foundation

Status: complete baseline.

Includes the clean pnpm workspace, quality/audit gates, hardened HTTP runtime, liveness/readiness and reproducible container runtime smoke. This slice contains no 2026 domain decision.

## Slice 1 — Identity and session contract

Primary issue: #4.

Concepts required:

- Account/User principal;
- minimum Profile projection;
- Session;
- verification claim for email/login method;
- account status;
- security/audit event vocabulary.

Must not require final Academic Graph storage to define secure session lifecycle.

Required outcomes: register, login, email verification, me/bootstrap, logout/revoke, recovery, lockout/rate policy and one backend authority for Web/Mobile.

Important constraint: the current JWT `role` claim is legacy behavior, not the future authorization model.

## Slice 2 — Canonical academic catalog + affiliation/context

Primary issues: #5 and #10.

Requires the real DER reconciliation and persistence ADR.

Concepts:

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

This is the domain foundation for meaningful onboarding, profile personalization, search and Resources.

Do not implement only `career_id` on User as a bridge. That would encode the wrong cardinality.

## Slice 3 — Living profile

Primary issue: #9.

Depends on Slice 1 and enough of Slice 2 to reference canonical academic identity.

Initial MVP profile should include display identity, current academic context, compact historical affiliation projection, useful interests/help signals and privacy defaults.

Professional visibility should exist only when a product surface consumes it. Deep visual presets can wait until core identity/context works.

## Slice 4 — Resources / Notes

Primary issue: #6.

Depends on authenticated principal, academic context and storage authorization contract.

Concepts:

- Resource;
- ResourceAsset/upload intent;
- authorship;
- academic context;
- visibility;
- save/bookmark;
- report/moderation state.

Critical invariants:

- asset identity is not authorization;
- finalize is idempotent;
- privacy transition is server-authoritative;
- save is not access;
- abandoned uploads are cleanable.

## Slice 5 — Search and contextual discovery

Primary issues: #5, #6 and #8.

Initially provide deterministic/scoped discovery over canonical product data.

Search is a projection/indexing concern; it must not redefine canonical ownership. Do not start algorithmic feed ranking here.

## Slice 6 — Social + lightweight Q&A

Primary issue: #8.

Potential concepts: Follow, reciprocal Connection only if MVP evidence requires it, Question, Answer, Report and essential notifications.

Keep social edges distinct from shared academic context.

## Slice 7 — Contextual Home

Primary issues: #8 and later #11.

The first Home can be rule-based and explainable: current subjects, relevant resources, useful questions, people from valid context and explicit followed sources.

The product does not need a sophisticated recommender to validate the MVP.

## Slice 8 — Organizations and alumni lifecycle

Primary issues: #12 and #13.

The data model must remain compatible from Slice 2 onward, but full UI/workflows can wait.

Future concepts include Organization, ManagementGrant, organization follow/membership, multiple/historical AcademicAffiliations, alumni/mentor transitions and events.

## Slice 9 — Opportunities and professional discovery

Post-core product.

Requires explicit professional visibility opt-in, source attribution, sponsorship labeling and privacy boundaries separate from the ordinary academic profile.

## Implementation dependency graph

```text
Runtime foundation
      |
      v
Identity/session
      |
      +-------------------+
      |                   |
      v                   |
DER + persistence ADR     |
      |                   |
      v                   |
Academic catalog/context  |
      |                   |
      +-----> Profile <----+
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
```

## What can proceed while DER is missing

Safe work:

- Identity/session conceptual/API contract;
- auth threat model;
- verification/recovery semantics;
- API error contract;
- storage/file authorization ADR design;
- contract test structure;
- product telemetry vocabulary;
- documentation.

Blocked or intentionally limited:

- final Academic Graph persistence;
- catalog physical model;
- profile academic storage;
- Resource academic storage shape;
- migrations from `career_id`;
- any decision that assumes one current university/career.

## Definition of slice completion

A slice is not complete because models/controllers exist.

Each implemented slice should have:

- domain invariants encoded in tests;
- backend authorization tests including negative cases;
- stable API contract;
- Web/Mobile-consumable semantics;
- migration/versioning plan;
- degraded/error behavior;
- exact-head CI evidence;
- runtime smoke coverage when behavior crosses process/database/storage boundaries.
