# Pilot metrics cardinality bounds

**Canonical issue:** #88  
**Scope:** `GET /pilot/admin/metrics`.

## Problem

The Pilot metrics endpoint returned small summary objects, but several internal
queries still amplified with the size of the pilot population:

- current-window `distinct(userId)`;
- previous-window `distinct(userId)`;
- a Node-built union of those ids;
- an `academic_affiliations.userId IN [...]` query;
- contribution `distinct(userId)`;
- full per-subject arrays from participations, Resources, Questions and Pilot
  events before trimming to 100 subjects in Node.

The response was bounded. The work required to produce it was not.

## Audience/activity aggregation

Activity and audience cohort counts are now computed inside MongoDB.

The aggregation:

1. scans Pilot events only across the previous+current window;
2. groups by user id inside Mongo;
3. marks current and previous-window presence;
4. keeps only current-window active users;
5. joins Academic affiliation status in the database;
6. classifies the user as active student, alumni or community using the same
   precedence as before;
7. groups to at most three cohort rows.

Node receives only cohort totals.

No user-id array is materialized in application memory and no cohort-sized
`$in` query is constructed.

## Contributor count

Contribution event count remains a scalar `countDocuments`.

Distinct contributors are now calculated with:

- bounded date/event match;
- `$group` by user id in Mongo;
- `$count`.

Node receives at most one row instead of every contributor id.

## Subject density

Subject density is now one database aggregation using `$unionWith` across:

- current Academic subject participations;
- available Resources;
- available/open Questions;
- contribution Pilot events in the requested window.

The database then:

1. groups each source by subject;
2. unions the partial metrics;
3. re-groups by subject;
4. sorts by the established ranking:
   contribution events, current participants, resources, open Questions,
   subject id;
5. returns only `PILOT_SUBJECT_METRICS_LIMIT + 1` rows.

`PILOT_SUBJECT_METRICS_LIMIT = 100`.

The 101st row is a sentinel used only to set `subjectsTruncated`. It is never
returned to clients.

## Why audience does not use a hard user cap

A hard cap on users would make rates/cohort counts approximate or silently
wrong. The output cardinality is already constant: three cohort rows.

The correct bound is therefore **where the reduction happens**, not an
arbitrary maximum number of users whose activity may be counted.

Mongo may process all events in the requested window, but application memory,
JSON serialization and subsequent queries no longer scale with the number of
distinct users.

The metrics window remains bounded by the API to 1–90 days.

## Subject enrichment fan-out

The service enriches returned subject rows with canonical names.

Because the store can return at most 100 subjects, this fan-out has an explicit
upper bound of 100 catalog lookups. It does not grow with the total number of
subjects in the database.

A future bulk catalog lookup may reduce query count further, but the current
implementation is already cardinality-bounded.

## Indexes

Indexes added/aligned for the new aggregation shapes:

- Pilot events: `createdAt + userId`;
- Pilot events: `event + createdAt + subjectId`;
- Academic subject participations: `state + subjectId`;
- Resources: `moderationState + subjectId`;
- Questions: `moderationState + state + subjectId`.

Existing account/status indexes continue to support affiliation lookup.

## UI contract

The public HTTP shape of Pilot metrics does not change.

`subjectsTruncated` remains explicit and Admin Pilot continues to display:

> Vista limitada a las 100 materias de mayor actividad.

Audience/activity/contributor metrics remain exact for the selected window.

## Regression evidence

Required:

- Mongo store spec proves audience/contributor aggregation returns only summary
  rows;
- no `distinct(userId)` dependency is required by the store;
- subject pipeline contains exactly three `$unionWith` sources and ends with
  `$limit: 101`;
- 101 synthetic subject rows produce 100 returned rows plus
  `subjectsTruncated=true`;
- empty metrics produce zero cohort/contributor counts without special unbounded
  fallback;
- Web contract pins the 100-subject truncation disclosure;
- Pilot runtime smoke asserts `subjects.length <= 100` and boolean
  `subjectsTruncated`.

## Non-goals

This carrier does not change the meaning of Pilot metrics, introduce sampling,
or cap the number of users counted.

It only changes execution so application-level cardinality remains bounded.
