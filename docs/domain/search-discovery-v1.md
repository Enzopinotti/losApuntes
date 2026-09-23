# Search + contextual discovery v1

**Status:** implemented  
**Slice:** 5 — deterministic search/discovery

## Purpose

Search v1 helps a user find existing canonical product data without becoming a hidden recommendation system.

It searches only authorities that already exist:

- visible Resources / Notes;
- canonical Academic Graph Subjects;
- Profiles whose `about` section is public.

Authenticated contextual discovery additionally groups recent visible Resources by the user's current SubjectParticipation records.

## Non-goals

Search v1 does not implement:

- Feed ranking;
- For You;
- social graph scoring;
- popularity/trending scores;
- engagement optimization;
- OCR/full-text extraction;
- vector/semantic retrieval;
- organization/event/opportunity search;
- opaque relevance personalization.

Those belong to later slices and must not be inferred from Search v1.

## Deterministic search contract

Global search accepts a normalized query and a requested scope:

- `all`;
- `resources`;
- `subjects`;
- `people`.

Results are grouped by source authority. There is no cross-type numeric score.

### Resources

Delegates to Resource authorization/search.

Anonymous users receive public Resources only. Authenticated users may additionally receive owned/shared Resources exactly as Resource policy permits.

### Subjects

Delegates to Academic Graph search for canonical `subject` nodes.

Aliases/redirect behavior remains owned by Academic Graph.

### People

Only Profiles with `visibility.about == public` are eligible.

People search returns only:

- public Profile UUID;
- public display name;
- public avatar URL.

It does not search or expose private bio, private academic context, private skills, career-discovery opt-in or recommendation signals.

## Contextual discovery

`GET /discovery/contextual` is authenticated.

It uses the user's SubjectParticipation records with state `current`, resolves each canonical Subject and returns a bounded bucket of recently updated visible Resources for each subject.

Rules:

- no hidden score;
- no popularity signal;
- deterministic subject ordering;
- deterministic Resource recency ordering inherited from Resources;
- privacy/moderation reauthorization remains authoritative;
- a user with no current subjects receives an empty list, not fabricated recommendations.

## Query safety

- query: 2–120 characters;
- per-scope result limit: 1–20;
- profile regex input is escaped;
- no raw regex is accepted from clients;
- result fan-out is bounded;
- malformed scopes/limits fail validation.

## Persistence

Search is a read projection concern.

V1 reuses bounded reads against current Mongo adapters. This is intentionally replaceable by a dedicated search/index projection later. Moving to a search engine must not change Account, Profile, Academic or Resource canonical ownership.

## Privacy rule

Search eligibility is computed from current source state on every request.

Indexing/projection work added later must preserve:

- privacy changes remove future eligibility;
- moderation changes remove future eligibility;
- saved resources do not grant search/read authority;
- Profile discovery never upgrades non-public Profile sections to public.

## Verification

The permanent verification contract includes:

- dedicated Search critical coverage;
- privacy-negative People tests;
- anonymous/authenticated Resource search tests;
- canonical Subject search tests;
- contextual discovery tests;
- static Web transport/privacy contract;
- a self-contained container smoke that creates its own public Profile fixture;
- real Mongo + MinIO lifecycle inherited from the full runtime smoke;
- exact-head verification before merge and a fresh full verification on merged `main`.

The Search smoke is deliberately independent from Profile smoke state. It creates its own user/Profile fixture so ordering or cleanup in another module cannot make Search appear green or red accidentally.
