# Profile v1 — completion matrix

## Scope

This matrix defines completion of Profile v1 across the shared backend contract and the current Web product surface.

Native Mobile remains a separate client module (#7/#49). It must consume the same Profile/Auth/Academic authorities rather than reopening Profile design.

| Capability | API | Web | Evidence |
| --- | --- | --- | --- |
| Stable public Profile UUID | Implemented | Consumed | Unit + runtime |
| Account/Profile separation | Implemented | Respected | Domain contract |
| Progressive minimal onboarding | Implemented | Implemented | Web build + runtime API |
| Display name / bio / avatar URL | Implemented | Editable | Unit + build |
| Skills / interests / languages | Implemented | Editable | Unit + runtime |
| Learning/help topics | Implemented | Editable | Unit + build |
| Controlled presentation model | Implemented | Contract-ready | Validation tests |
| Per-section visibility | Implemented | Editable | Unit + runtime |
| Public privacy fail-closed | Implemented | Server projection only | Negative unit + runtime |
| University/connections visibility | Stored fail-closed | Explained | Negative privacy contract |
| Recommendation signals separate from visibility | Implemented | Editable | Unit + runtime |
| Career discovery explicit opt-in | Implemented | Editable/explained | Runtime leak check |
| Academic identity projection | Academic Graph authority | Read-only summary | Unit + runtime |
| Multiple/historical affiliations preserved | Academic Graph authority | Projected | Shared contract |
| Current academic context projection | Academic Graph authority | Read-only | Shared contract |
| Activities/projects/research/etc. | Implemented | Create/list/delete | Unit + runtime |
| Activity period integrity | Implemented | Error surfaced | Unit + runtime |
| Contribution/trust projection | Explicit unavailable/empty | No fabricated counters | Contract |
| Optimistic Profile concurrency | Implemented | Stable conflict UX | Unit + runtime |
| Optimistic Activity concurrency | Implemented | Stable conflict UX | Unit + runtime |
| Cross-user write isolation | Implemented | No client authority | Unit |
| Persistence adapter boundary | ProfileStore | N/A | Architecture |
| HttpOnly-cookie Web transport | Existing Auth authority | Implemented | Static/build contract |
| Dedicated critical coverage | Enforced | N/A | CI |
| Container lifecycle smoke | Implemented | API lifecycle | CI |

## Honest limitations

Profile v1 does not claim native-device UI acceptance or real-browser E2E automation.

The Web application is typechecked/linted/built by the repository quality gate, while the HTTP lifecycle and privacy behavior are exercised against the real containerized API/Mongo runtime. Native presentation is closed later as part of the Mobile module, without changing Profile ownership or privacy semantics.

## Closure rule

Profile v1 is complete when the exact PR head and then merged `main` pass:

- Quality Gate;
- Auth critical coverage;
- Academic critical coverage;
- Profile critical coverage;
- Production dependency audit;
- Container runtime smoke.

The closure evidence must record the candidate SHA, merge SHA and post-merge run. Product issue #9 may then close because the current Web product has a short onboarding, editable profile, privacy controls, activities and public profile; Mobile remains explicitly owned by #7/#49.
