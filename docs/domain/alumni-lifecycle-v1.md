# Alumni lifecycle v1

**Issue:** #12  
**Status:** In implementation  
**Authority:** Academic Graph + Profile + Feeds + Pilot contracts

## 1. Mission

Graduation is a context transition, not account retirement.

Los Apuntes must preserve academic history while allowing the product to move from a subject-centric student experience toward university/career/community continuity.

## 2. No global graduation boolean

The product does not use `isGraduated`.

Academic identity remains a set of simultaneous/historical AcademicAffiliations.

Each affiliation has:

- canonical Institution and optional Campus / Academic Unit / Program / Curriculum;
- lifecycle status;
- coarse start/end period;
- zero or more relationship roles.

Relationship roles are:

- `student`;
- `advanced_student`;
- `recent_graduate`;
- `alumni`;
- `mentor`;
- `teaching`;
- `research`;
- `community`.

Roles are relationship context, not platform permissions or institutional verification.

## 3. Graduation transition

Graduation is an explicit authenticated transition on one owned affiliation.

The transition:

1. preserves the affiliation record and canonical scope;
2. changes its status to `alumni`;
3. records the graduation/end period;
4. removes student/advanced-student roles from that affiliation;
5. adds `recent_graduate` and `alumni`;
6. preserves unrelated roles such as mentor/teaching/research/community;
7. changes current SubjectParticipation rows inside that affiliation scope from `current` to `completed`;
8. if the user's current context points at that affiliation, keeps the affiliation context but clears the subject participation;
9. appends a durable academic audit event.

The transition is idempotent after a successful graduation. It never deletes prior SubjectParticipation or affiliation history.

The generic affiliation-status endpoint may not be used to bypass the graduation transition when setting `alumni`.

## 4. Current context after graduation

An alumni/completed affiliation may be selected as current context without a subject.

An alumni/completed affiliation may not carry a current SubjectParticipation.

This prevents Web/Mobile contracts from assuming that every valid user must have a current subject.

## 5. Academic continuity follows

Users may explicitly follow canonical:

- Institution;
- Program.

These follows are separate from affiliation and do not imply enrollment, membership or endorsement.

Follow identity is merge-safe: catalog redirects resolve to the canonical node and old IDs remain removable after a catalog merge.

People/connection and Campus Organization follow semantics remain owned by their existing modules.

## 6. Lifecycle projection

`GET /academic/me/lifecycle` returns a derived lifecycle projection.

The top-level phase is one of:

- `student`: at least one active/paused student affiliation and no alumni history;
- `alumni`: alumni/completed history and no active student affiliation;
- `mixed`: both active student context and alumni history;
- `community`: no active-student or alumni affiliation.

The projection includes:

- active-student affiliation IDs;
- alumni affiliation IDs;
- current Subject IDs;
- academic follows;
- whether current subject context exists.

This projection is derived from current authority; it is not persisted as a second source of truth.

## 7. Home/feed behavior

For active students, Home continues to lead with the bounded Academic Feed.

For alumni with no current subjects, Home switches the primary bounded feed surface to community continuity using existing explicit social/organization signals.

The existing For You feed remains a separate cross-university surface.

V1 does not invent official Institution/Program publishing. Institution/Program follows are durable continuity intent for current/future official publishing and discovery, not fabricated content.

## 8. Metrics

Pilot metrics distinguish value for:

- active-student users;
- alumni users;
- other/community users.

For each cohort, the window reports active users and returning users.

The cohorts are derived from AcademicAffiliation state; activity events remain the activity authority.

Alumni success is not reduced to DAU or minutes consumed.

## 9. Web

Web must:

- show alumni/mixed lifecycle without a "missing subjects" error;
- label the continuity feed appropriately;
- allow explicit Institution/Program follows;
- preserve Profile/Resources/Organizations/Network access after graduation;
- not require a current subject to render Home.

## 10. Honest boundaries

Alumni v1 does not claim:

- diploma/degree credential verification;
- official graduate registry integration;
- automated recent-graduate expiry;
- mentoring marketplace matching;
- employer/recruiter workflows;
- official Institution publishing;
- native Mobile UI acceptance.

Those can build on this lifecycle without changing AcademicAffiliation history.
