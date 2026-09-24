# Alumni lifecycle v1 — completion matrix

**Issue:** #12 — closed by PR #67  
**Status:** Implemented / Validated on `main`

**Candidate evidence:** `bbf35aba3a6f330ae94c21fe3b3559d06934a6e3` — verify #851 / run `36041222896` green.  
**Merge:** `f331c58d138659ccd460f1e2d7d4fbe032254150`.  
**Post-merge evidence:** verify #852 / run `36041957764` green on exact `main` SHA, including Container runtime smoke.

| Capability | Required evidence |
| --- | --- |
| No global graduation boolean | domain/schema/static |
| Multiple historical/concurrent affiliations preserved | existing Academic Graph + runtime |
| Multi-role affiliation projection | unit + HTTP |
| Graduation transition preserves history | unit + runtime |
| Current scoped subjects become completed | unit + runtime |
| Current subject context clears on graduation | unit + runtime |
| Graduation transition atomic with audit | adapter/runtime |
| Repeated graduation is idempotent | unit + runtime |
| Generic status cannot bypass graduation | negative unit |
| Concurrent status writes cannot overwrite graduation | unit + exact-head CI |
| Status transitions preserve role compatibility | unit + exact-head CI |
| Concurrent role writes cannot reintroduce student roles after graduation | unit + exact-head CI |
| Explicit `roles: []` remains empty | helper/unit |
| Alumni context valid without subject | unit + runtime |
| Alumni subject context rejected | negative unit |
| Institution/Program follow | unit + runtime |
| Academic follows merge-safe | unit |
| Stale unavailable follows do not break lifecycle/Home | unit + runtime |
| Lifecycle phase projection | unit + runtime |
| Alumni Home without current subjects | API + Web |
| Community continuity primary feed | Feed/Pilot unit + runtime |
| For You remains separate | contract/runtime |
| Cohort metrics active-student vs alumni | Pilot unit + runtime |
| Web does not assume current subjects | static/build |
| Dedicated Alumni critical coverage | CI |
| Full container lifecycle smoke | CI |
| Exact-head green | verify #851 / run `36041222896` |
| Post-merge green | verify #852 / run `36041957764` |

## Honest boundaries

No diploma verification, official graduate registry, automated role expiry, mentoring marketplace, official Institution publishing or native Mobile UI acceptance is claimed by v1.
