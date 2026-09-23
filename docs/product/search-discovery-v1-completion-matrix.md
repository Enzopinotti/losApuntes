# Search + contextual discovery v1 — completion matrix

**Status:** implementation complete — merge evidence is recorded on PR #62

| Capability | API/domain | Web | Evidence |
| --- | --- | --- | --- |
| Global bounded query | Implemented | Implemented | Unit + build + runtime |
| Resource search authorization | Reuses current Resources authority | Implemented | Unit + runtime |
| Canonical Subject search | Reuses Academic Graph redirects/aliases | Implemented | Unit + runtime |
| Public Profile search | Implemented | Implemented | Privacy-negative unit + runtime |
| No private Profile leakage | Enforced by Profile public eligibility | Server projection only | Unit + static contract + runtime |
| Optional authenticated search | Implemented; presented invalid credentials fail closed | Cookie transport | Unit + static + runtime |
| Current-subject contextual discovery | Implemented | Implemented | Unit + runtime |
| Empty context does not fabricate recommendations | Implemented | Honest empty state | Unit + Web |
| No popularity/engagement score | Enforced by grouped deterministic contract | Explainable grouped UI | Unit + docs/static |
| Query/fan-out bounds | Implemented | Bounded controls | Validation + unit |
| Dedicated critical coverage | Enforced | N/A | CI |
| Container runtime smoke | Self-contained Search fixture | API lifecycle | CI |
| Full-module regression smoke | Auth → Academic → Profile → Files/Resources → Search | N/A | CI |
| Exact-head + merged-main verification | Required release gate | N/A | CI / PR evidence |

## Privacy and authority closure

Search does not own canonical product data.

- Resource visibility/moderation remains authoritative on every query.
- Academic Graph remains authoritative for Subject identity and redirects.
- Only Profiles with public `about` are eligible for People search.
- Search never returns account ids, email, career-discovery opt-in, recommendation signals or non-public Profile sections.
- A presented invalid session cannot silently become an anonymous search.

## Explicit non-goals

This slice does **not** implement Feed/For You ranking, social scoring, popularity/trending, engagement optimization, OCR/vector search, organizations/events/opportunities or opaque personalization.

Those capabilities require later modules and cannot be inferred from Search v1.

## Closure rule

The implementation is considered releasable only when the exact PR head and then the merged `main` both pass the full repository verification pipeline. PR #62 carries those concrete SHAs/run IDs so this document does not become stale when future commits advance `main`.
