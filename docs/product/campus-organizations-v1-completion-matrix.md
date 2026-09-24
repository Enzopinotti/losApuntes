# Campus Organizations v1 — completion matrix

**Issue:** #13  
**Status:** Candidate — exact-head and post-merge evidence required

| Capability | Required evidence |
| --- | --- |
| Organization distinct from Institution/Profile | architecture + schema |
| Stable organization UUID | adapter + runtime |
| Academic scope canonicalization | unit + runtime |
| Claimed vs verified separation | unit + HTTP |
| Creation does not auto-verify | negative unit + runtime |
| Verification platform permission | guard negative + runtime |
| owner/admin/editor management | unit + runtime |
| Final owner cannot be removed | negative unit + runtime |
| Admin cannot create/remove owner | negative unit |
| Manager role audit | persistence + runtime |
| Explicit follow/unfollow | unit + runtime |
| No institution auto-follow | architecture/static |
| Organization posts | unit + runtime |
| Organization post source attribution | projection + runtime |
| Organization events | unit + runtime |
| Event date integrity | negative unit |
| External useful links | validation + runtime |
| Featured Resource reauthorization | negative unit + runtime |
| Organization directory | API + Web |
| Public organization page | API + Web |
| Manager Web surface | Web build/static contract |
| Followed-org For You eligibility | Feeds unit + runtime |
| Unfollow removes future eligibility | Feeds runtime |
| No implicit Academic Feed injection | Feeds negative unit |
| Organization coverage gate | CI |
| Web organization contract | static test |
| Full container smoke | CI |
| Exact-head green | PR evidence |
| Post-merge green | closure evidence |

## Honest boundaries

V1 does not claim:

- student-election/campaign tooling;
- legal verification automation;
- ticketing/RSVP/calendar sync;
- organization chat;
- paid promotion;
- official Institution publishing;
- native Mobile UI acceptance.

Those require separate domain/product decisions rather than being smuggled into Organization semantics.
