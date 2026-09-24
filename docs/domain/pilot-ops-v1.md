# Pilot Operations v1

**Issue:** #8  
**Status:** Implemented / Validated  
**Date:** 2026-09-23

## Product purpose

Pilot Operations closes the loop required to run Los Apuntes with a real university cohort instead of treating launch as only a collection of product screens.

The slice adds four things on top of the already-implemented Academic Graph, Profile, Files/Resources, Search, Social/Q&A, Notifications and Feeds domains:

1. a contextual Home that composes existing authorities without creating a second ranking system;
2. auditable moderation resolution across Resources and Q&A;
3. a minimal operator surface for pilot support;
4. privacy-bounded product telemetry that lets reviewers measure activation, no-result search, contribution, subject density, report backlog and returning use.

## Authority boundaries

### Existing domains remain authoritative

Pilot Operations does not own:

- Account/session identity;
- Profile fields;
- Academic Graph identity/context;
- Resource/Q&A content;
- Social graph;
- Feed ranking;
- Notification ownership/read state.

It calls those domains or reads their existing persistence through explicit pilot ports.

### Pilot owns

- moderation review decisions and durable moderation audit;
- pilot activity event records;
- aggregated pilot metrics;
- a Home composition response;
- operator permissions for pilot observability/moderation.

## Contextual Home

The authenticated Home response reuses current product authorities:

- current academic context and current subject participations;
- first Academic Feed page;
- first For You page;
- unread notification count;
- onboarding/profile readiness.

It never computes an independent popularity score and never expands the feed beyond the existing bounded feed contract.

An anonymous visitor continues to receive the public landing experience.

## Moderation

The 2026 domain contract requires moderation to be non-destructive and attributable.

Pilot Operations exposes one queue covering pending:

- Resource reports;
- Question reports;
- Answer reports.

Supported review outcomes:

- `hide` — hide the target from normal product reads;
- `restore` — make the target available again;
- `dismiss` — resolve the report without changing target moderation state.

Each review records:

- stable moderation-action UUID;
- operator user id;
- report kind/id;
- target kind/id;
- action;
- reason;
- timestamp.

The original report record is retained and moves from `pending` to `resolved` or `dismissed`. Content is not hard-deleted.

Concurrent review is compare-and-set: only a pending report can be reviewed. Replays fail closed and cannot overwrite the first decision.

## Permissions

Pilot Operations uses explicit platform permissions:

- `pilot:ops:read` — pilot dashboard and moderation queue;
- `moderation:write` — resolve moderation reports.

Permissions are server-authoritative through `UsersService.hasPlatformPermission`. The legacy scalar `User.role` does not grant Pilot authority.

## Product telemetry

Telemetry is deliberately narrow.

Stored event names:

- `pilot.home_viewed`;
- `pilot.search_performed`;
- `pilot.resource_created`;
- `pilot.question_created`;
- `pilot.answer_created`;
- `pilot.follow_created`;
- `pilot.connection_accepted`.

Events contain only:

- stable event UUID;
- optional authenticated user id;
- event name;
- optional canonical Subject id;
- bounded numeric/result dimensions;
- UTC timestamp.

Search query text, Resource/Q&A body text, email, IP address, user agent and signed URLs are **not** persisted in Pilot telemetry.

## Metrics

The operator dashboard reports a bounded window (default 14 days, maximum 90):

### Onboarding

- accounts created;
- profiles created;
- onboarding completion rate;
- onboarding drop-off count.

### Search

- total searches;
- no-result searches;
- no-result rate.

### Contributions

- distinct contributors;
- contribution events;
- contribution rate against active users.

### Activity / retention

- active users in current window;
- returning users: users with activity in both the current window and the immediately preceding equal-sized window;
- returning rate.

This is an operational returning-use metric, not a claim of formal cohort-retention science.

### Campus density

Per canonical Subject:

- current participant count;
- Resource count;
- open Question count;
- contribution events in the window.

The dashboard can therefore identify subjects that are merely catalogued versus meaningfully active.

### Moderation

- pending reports;
- resolved/dismissed reports in window;
- oldest pending report age.

## Cold-start and launch integrity

The dashboard supports legitimate seeding and pilot review; it must not be used to fabricate engagement.

Pilot data may come from:

- real ambassadors;
- legitimate uploaded resources;
- useful real questions;
- verified institutional/campus opportunities when their own domains exist.

Fake users, fake answers, fake follows and fabricated activity events are prohibited.

## Operational ownership

Before public pilot launch, the runbook must name:

- product owner;
- moderation/support owner;
- infrastructure rollback owner;
- pilot institution/campus/career scope;
- support channel;
- rollback criteria.

Those values are deployment inputs, not hard-coded application defaults.

The required fail-closed launch procedure is documented in
`docs/operations/pilot-v1-runbook.md`. A public pilot remains blocked until
its launch record contains concrete scope, accountable owners, support channel,
release/rollback SHAs and change-window evidence.

## Explicit non-goals

Pilot Operations v1 does not claim:

- automated moderation/AI policy decisions;
- direct messaging;
- organization management;
- alumni transitions;
- native Mobile acceptance;
- production observability/SLA evidence;
- advertising/engagement optimization;
- arbitrary analytics event ingestion from clients.

## Verification

Issue #8 is closed with candidate and post-merge evidence:

- candidate SHA: `02bcb5c9871d391b41e8d7102e91bc0bc00f46e0`;
- candidate verify: #713 / run `35927435297`, success;
- merge/main SHA: `77438de634c4f73bc53242dd010e2a8c542f52b9`;
- post-merge verify: #714 / run `35927820127`, success.

The verified gates include:

- Quality Gate;
- all existing critical coverage gates;
- dedicated Pilot critical coverage;
- production dependency audit;
- container runtime smoke including moderation and pilot metrics;
- Web static contract for authenticated Home/admin privacy and cookie transport.

This evidence closes Pilot Operations v1 as implemented/validated. A real public pilot remains separately gated by deployment inputs such as institution scope, accountable owners, support channel, production release/rollback SHAs and change-window evidence.

