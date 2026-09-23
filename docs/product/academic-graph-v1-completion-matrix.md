# Academic Graph v1 — completion matrix

## Scope

This matrix defines completion of the backend Academic Graph/Catalog foundation.

It does not claim that Web or native Mobile have already implemented all user-facing academic onboarding screens.

| Capability | Backend | Contract | Negative tests | Runtime evidence |
| --- | --- | --- | --- | --- |
| Canonical stable UUIDs | Implemented | Documented | Yes | Yes |
| Flexible academic hierarchy | Implemented | Documented | Yes | Yes |
| Alias lookup | Implemented | Documented | Yes | Yes |
| Source provenance | Implemented | Documented | Yes | Yes |
| Source-scoped external ID uniqueness | Implemented | Documented | Yes | Yes |
| Active/inactive lifecycle | Implemented | Documented | Yes | Yes |
| Merge + redirect preservation | Implemented | Documented | Yes | Yes |
| Redirect-safe child discovery and canonical projections | Implemented | Documented | Yes | Yes |
| Redirect loop/depth fail-closed behavior | Implemented | Documented | Yes | Unit |
| Optimistic revision control | Implemented | Documented | Yes | API path |
| Explicit catalog-write permission | Implemented | Documented | Yes | Yes |
| Multiple/historical affiliations | Implemented | Documented | Yes | Yes |
| Cross-institution consistency checks | Implemented | Documented | Yes | Yes |
| SubjectParticipation | Implemented | Documented | Yes | Yes |
| CourseOffering relation validation | Implemented | Documented | Yes | Yes |
| Server-authoritative current context | Implemented | Documented | Yes | Yes |
| Ownership isolation | Implemented | Documented | Yes | Auth guard + unit |
| Missing-data proposal | Implemented | Documented | Yes | Yes |
| Proposal stays non-canonical | Implemented | Documented | Yes | Yes |
| Admin proposal review lifecycle | Implemented | Documented | Yes | Yes |
| Review replay/concurrency fail-closed | Implemented | Documented | Yes | Yes |
| Durable academic audit | Implemented | Documented | Yes | Mongo smoke |
| Mutation + audit atomicity | Implemented | Documented | Unit-of-work boundary | Transaction-capable runtime |
| Bounded cursor pagination | Implemented | Documented | Yes | Unit |
| Persistence adapter boundary | Implemented | Documented | Architectural | Build |
| Dedicated critical coverage gate | Implemented | CI | Threshold enforced | CI |
| Container lifecycle smoke | Implemented | CI | Includes deny paths | CI |

## Deliberately not represented as incomplete engineering work

### Real pilot institution/program selection

A real launch university/program is operational product content, not a missing backend capability.

The runtime smoke intentionally uses synthetic data so automated CI never claims real institutional authority.

Before a public pilot, the launch owner must choose the actual pilot source set and load it using authoritative evidence under the source strategy.

That launch input can be recorded in release/pilot documentation without keeping a permanent engineering issue open.

### DER revision

The NotebookLM DER is a later architecture reconciliation artifact.

It may change physical persistence and cardinalities. The current application/persistence boundary exists specifically to make that change possible.

### Web/Mobile UI

The Academic Graph backend contract is consumable by both clients.

Actual onboarding/profile/resource UI belongs to the relevant client/product slices and must not be misrepresented as implemented here.

## Closure rule

Academic Graph v1 is backend-complete only when the exact PR head and then merged `main` pass:

- Quality Gate;
- Auth critical coverage;
- Academic critical coverage;
- Production dependency audit;
- Container runtime smoke.

The issue/PR closure comment must record the final merge SHA and post-merge verification run.
