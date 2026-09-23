# Profile v1 backend — completion matrix

## Scope

This matrix defines completion of the Profile v1 backend foundation. It does not claim the Web/Mobile profile/onboarding experience required to close product issue #9.

| Capability | Backend target | Source of truth |
| --- | --- | --- |
| Stable public Profile UUID | required | Profile |
| Account/Profile separation | required | Auth/User + Profile |
| Display name / bio / avatar URL | required | Profile |
| Skills / interests / languages | required | Profile |
| Learning/help topics | required | Profile |
| Controlled presentation presets | required | Profile |
| Per-section visibility | required | Profile |
| Recommendation flags separate from visibility | required | Profile |
| Career discovery explicit opt-in | required | Profile |
| Academic identity projection | required | Academic Graph |
| Multiple/historical affiliations preserved | required | Academic Graph |
| Current context projection | required | Academic Graph |
| Activities/projects/research/etc. | required | ProfileActivity |
| Contribution/trust projection | explicit empty/unavailable | future modules |
| Optimistic concurrency | required | Profile/ProfileActivity |
| Cross-user write isolation | required | Auth + ProfileStore |
| Public privacy fail-closed | required | ProfileService |
| University/connections policy values | stored, fail-closed for viewers | future verified/social evidence |
| Persistence adapter boundary | required | ProfileStore |
| Dedicated critical coverage | required | CI |
| Container runtime smoke | required | CI |

## Closure rule for backend lane

Backend lane is complete only when the exact PR head and then merged `main` pass:

- Quality Gate;
- Auth critical coverage;
- Academic critical coverage;
- Profile critical coverage;
- Production dependency audit;
- Container runtime smoke.

## Product issue #9 remains open after backend closure when

Any of these are still missing:

- short onboarding UX;
- editable Web/Mobile profile experience;
- public profile UI;
- privacy controls surfaced to the user;
- progressive profile prompts.

Backend completion is necessary but not sufficient for the product acceptance criteria.
