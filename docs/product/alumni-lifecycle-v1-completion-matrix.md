# Alumni lifecycle v1 — completion matrix

**Issue:** #12  
**Status:** Candidate — exact-head and post-merge evidence required

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
| Alumni context valid without subject | unit + runtime |
| Alumni subject context rejected | negative unit |
| Institution/Program follow | unit + runtime |
| Academic follows merge-safe | unit |
| Lifecycle phase projection | unit + runtime |
| Alumni Home without current subjects | API + Web |
| Community continuity primary feed | Feed/Pilot unit + runtime |
| For You remains separate | contract/runtime |
| Cohort metrics active-student vs alumni | Pilot unit + runtime |
| Web does not assume current subjects | static/build |
| Dedicated Alumni critical coverage | CI |
| Full container lifecycle smoke | CI |
| Exact-head green | PR evidence |
| Post-merge green | closure evidence |

## Honest boundaries

No diploma verification, official graduate registry, automated role expiry, mentoring marketplace, official Institution publishing or native Mobile UI acceptance is claimed by v1.
