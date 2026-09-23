# Profile v1 — living academic identity backend contract

## Status

Backend design for Slice 3 of the 2026 reboot.

This contract reconciles the historical profile requirements with the accepted 2026 domain model. Historical requirements ask for a personal academic/professional profile with name, photo, bio, university/career/year, skills, languages, achievements and privacy controls. The 2026 model keeps the user-facing goal but changes where truth lives:

- Account/User remains the authentication principal;
- Profile owns presentation and user-authored self-description;
- Academic Graph owns institution/program/subject history and current context;
- future Resources/Q&A/Social modules own contribution and relationship evidence;
- recruiting/professional discoverability is explicit opt-in and is not inferred from study activity.

The legacy User fields `full_name`, `avatar_url`, `bio`, `career_id` and `cohort_year` are migration evidence only. New Profile code must not write academic truth back into them.

## Profile identity

Each Profile has a stable product UUID independent from:

- Mongo ObjectId;
- email;
- display name;
- future username/handle;
- academic affiliation.

`userId` is an internal ownership link to the authenticated principal and is never the public profile identity.

## Editable profile data

Profile v1 owns bounded, user-authored data:

- display name;
- optional bio;
- optional HTTPS avatar URL until a first-class media/avatar asset flow exists;
- languages;
- skills;
- interests;
- topics where the user can help;
- topics where the user wants to learn/get help;
- optional professional headline;
- controlled presentation presets;
- section order;
- per-section visibility;
- recommendation-signal preferences;
- early-career/recruiting discoverability opt-in.

Profile v1 also supports bounded activity entries:

- project;
- research;
- club/organization activity;
- volunteering;
- academic work.

Each activity has its own stable UUID and revision so concurrent edits cannot silently overwrite each other.

## Data that Profile does not own

Profile must not persist copies of:

- institution/campus/faculty/program/curriculum/subject;
- current AcademicAffiliation;
- CurrentAcademicContext;
- SubjectParticipation;
- contribution counts sourced from Resources/Q&A;
- trust/moderation state;
- follow/connection membership;
- authentication/security state.

Owner profile reads compose academic state from Academic Graph at request time.

This avoids two authorities for university/career/year and keeps alumni/history semantics intact.

## Privacy sections

Profile v1 stores these section policies:

- `about`;
- `academic`;
- `learning`;
- `activities`;
- `skills`;
- `professional`;
- `contributions`.

Allowed values:

- `public`;
- `university`;
- `connections`;
- `private`.

Current enforcement is deliberately fail-closed:

- owner reads can see every section;
- anonymous public reads can see only sections explicitly set to `public`;
- `university` is not treated as authorization until verified academic-membership evidence exists;
- `connections` is not treated as authorization until the Social slice provides an authoritative relationship;
- private sections are never emitted publicly.

The stored policies are forward-compatible with later viewer-aware authorization without weakening privacy now.

## Recommendation and professional boundaries

Public profile visibility and recommendation eligibility are separate controls.

Profile stores explicit recommendation flags for user-provided academic context, learning topics and skills/interests. These flags are inputs to future recommendation systems; they are not public visibility switches.

`careerDiscoveryOptIn` defaults to false.

No profile field, academic history, private resource activity or recommendation flag may silently opt the account into employer/recruiter discovery.

## Presentation

Presentation is intentionally bounded:

- accent preset from a server-known allowlist;
- cover preset from a server-known allowlist;
- section order from known section keys.

Presentation never changes permissions or authorization.

## Progressive onboarding

An account without a Profile is valid.

`GET /profile/me` returns `onboardingRequired: true` rather than inventing a display identity from the email.

The short onboarding creates Profile with the minimum useful explicit field: `displayName`.

Everything else can be added progressively.

There is no punitive completion score in v1.

## Concurrency

Profile and activity updates use optimistic revisions.

A stale update fails with a stable conflict and never silently overwrites a newer edit.

Profile creation is protected by unique `id` and `userId` constraints. Persistence duplicate-key races are translated to domain-level conflicts.

## Academic projection

Owner reads include an Academic Graph projection sourced live from:

- affiliations;
- subject participations;
- current academic context.

Profile persistence stores none of those IDs as a second copy.

Public academic projection is emitted only when the user explicitly marks the academic section public.

## Contribution projection

The `contributions` section policy exists now, but contribution facts are not fabricated.

Until Resources/Q&A exist, Profile reports contribution projection as unavailable/empty rather than persisting vanity counters.

## Legacy migration

No automatic destructive migration is performed in Profile v1.

A future migration may seed Profile fields from legacy `full_name/avatar_url/bio` only with explicit deterministic rules. Legacy `career_id/cohort_year` must not seed canonical academic truth.

## Persistence boundary

Application code depends on `ProfileStore`.

The current Mongo/Mongoose adapter is replaceable under ADR 0004. Profile product IDs and HTTP semantics cannot depend on Mongo document identity.

## Non-goals

Profile v1 backend does not implement:

- Follow/Connection;
- verification of university membership;
- reputation/badges/rankings;
- contribution metrics;
- recruiter search;
- arbitrary HTML/profile themes;
- file-backed avatar upload;
- organization membership;
- Web/Mobile screens.

Those modules may project into Profile later without moving their source of truth into Profile.
