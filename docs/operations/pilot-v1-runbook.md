# Pilot v1 — operational runbook

**Issue:** #8  
**Status:** Required launch procedure  
**Date:** 2026-09-23

## Purpose

This runbook is the operational source of truth for running the first real Los Apuntes pilot. It complements the product/domain implementation; it does not replace production launch readiness, native Mobile acceptance, legal review or external provider checks.

A pilot is **not launch-ready** until every field in the launch record below has a concrete value and the preflight checklist is complete.

## 1. Ownership model

Los Apuntes uses explicit operational roles rather than implicit ownership.

| Responsibility | Required owner | Authority |
| --- | --- | --- |
| Pilot scope and success criteria | Product owner | choose institution/campus/careers, approve go/no-go |
| User support and moderation | Moderation/support owner | review reports, coordinate user support, escalate abuse |
| Runtime health and rollback | Infrastructure rollback owner | deploy, rollback, preserve evidence, restore service |
| Academic catalog evidence | Catalog/data owner | validate pilot institution/program/subject source evidence |

One person may hold multiple roles in an early pilot, but each role must have one explicitly named accountable person before launch.

## 2. Launch record

Complete this record in the deployment/release evidence for the pilot. Do not hard-code these values into application defaults.

- Pilot identifier:
- Planned launch date:
- Institution:
- Campus/Sede:
- Career/Program:
- Curriculum/Plan when relevant:
- Initial active Subject IDs:
- Product owner:
- Moderation/support owner:
- Infrastructure rollback owner:
- Catalog/data owner:
- Primary support channel:
- Incident/escalation channel:
- Release SHA:
- Backend/Web environment:
- Mobile build identifier, if Mobile participates:
- Rollback target SHA:
- Backup/snapshot reference:
- Change window:

If any required field is unknown, launch status is **BLOCKED**.

## 3. Pre-launch product checks

The reviewer must verify:

- Identity/Auth launch gates applicable to the environment are satisfied;
- Academic Graph contains the chosen pilot context and canonical subjects;
- Profile onboarding works for a newly verified account;
- Resource upload/read lifecycle works against the deployed object-storage provider;
- Search returns expected pilot subjects/resources and records no-result telemetry without storing query text;
- Social/Q&A core paths work for real accounts;
- contextual Home returns current academic context, Academic Feed, For You and notification count;
- operator accounts have only the required platform permissions;
- non-operators receive 403 for Pilot admin endpoints;
- moderation queue can hide, restore and dismiss reports;
- moderation actions write durable audit evidence;
- Pilot metrics render for the selected window;
- there are no open critical/high-severity launch blockers.

## 4. Cold-start integrity

Allowed seeding:

- real resources uploaded with permission;
- real ambassadors and verified pilot participants;
- useful real questions;
- official/verified campus opportunities when the corresponding domain exists.

Prohibited:

- fake users;
- fabricated follows/connections;
- fake answers;
- fabricated telemetry;
- artificially generated activity presented as real engagement.

Seed records must remain attributable to real actors or clearly marked operational fixtures outside production user analytics.

## 5. Daily pilot review

The Product owner and Moderation/support owner review at least once per operating day:

### Activation

- accounts created in the current review window;
- profiles completed;
- onboarding completion/drop-off.

### Search quality

- search count;
- no-result count/rate;
- recurring no-result themes gathered through support/user research, not raw query telemetry.

### Campus density

For the active pilot subjects:

- current participants;
- resources;
- open questions;
- contribution events.

A catalogued subject with little/no activity is not considered healthy merely because it exists in the graph.

### Retention proxy

Review:

- active users in current window;
- returning users present in both current and previous equal windows.

This is an operational returning-use proxy, not formal cohort retention.

### Moderation

Review:

- pending reports;
- age of oldest pending report;
- reports resolved/dismissed in the window;
- any repeated abuse or copyright/honor-code escalation requiring policy review.

## 6. Moderation procedure

1. Open the Pilot admin moderation queue.
2. Confirm report type, target, reporter evidence and current moderation state.
3. Choose exactly one action:
   - **hide** — target becomes unavailable to normal product reads;
   - **restore** — target becomes available again;
   - **dismiss** — report is resolved without changing target state.
4. Enter a concrete review reason.
5. Submit once.
6. Confirm the report leaves pending state and the target reflects the intended state.
7. If the action fails with a concurrency conflict, reload the queue and inspect the already-recorded decision; never overwrite another reviewer blindly.
8. Escalate legal/copyright/safety questions outside the product queue when specialist review is required.

Hard deletion is not part of Pilot v1 moderation.

## 7. Support triage

Support incidents are triaged into:

- account/authentication;
- academic catalog/context;
- resource upload/access;
- search/discovery;
- social/Q&A/notifications;
- moderation/reporting;
- runtime/infrastructure.

For every incident capture:

- timestamp;
- affected environment;
- user-safe identifier;
- request ID when available;
- observed behavior;
- expected behavior;
- severity;
- reproduction steps;
- owning role;
- resolution/rollback reference.

Do not copy passwords, session tokens, signed object-storage URLs, raw private content or unnecessary personal data into support notes.

## 8. Rollback criteria

The Infrastructure rollback owner initiates rollback when any of the following is confirmed and cannot be safely mitigated in-place:

- authentication/session authority regression;
- cross-user privacy leak;
- unauthorized file/resource access;
- moderation permission bypass;
- destructive/corrupting persistence behavior;
- sustained inability to create/read core pilot content;
- severe migration/runtime failure;
- release-specific error rate makes the pilot materially unusable.

Product owner may also call rollback for severe product-safety or pilot-integrity concerns.

## 9. Rollback procedure

1. Stop further rollout/change activity.
2. Preserve current logs, request IDs and relevant audit evidence.
3. Record current deployment SHA and affected components.
4. Revert/deploy the pre-recorded rollback target.
5. Do not delete Mongo/object-storage data as part of normal application rollback.
6. Verify:
   - API readiness;
   - Auth login/session;
   - Profile;
   - Academic context;
   - Resource access;
   - Search;
   - Home;
   - moderation queue.
7. Record incident owner and follow-up issue only if unresolved engineering work actually remains.

If schema/data migration rollback is involved, follow the migration-specific plan; do not improvise destructive data edits.

## 10. Stop / pause criteria

Pause acquisition/onboarding for the pilot when:

- moderation backlog has no accountable reviewer;
- support channel is unmonitored;
- academic context is materially incorrect;
- resource access or privacy cannot be trusted;
- rollback owner is unavailable during the change window;
- selected pilot scope is not populated enough to test the intended network behavior.

The goal is a useful, trustworthy pilot—not horizontal LATAM launch volume.

## 11. Closeout evidence

A pilot review package should contain:

- release SHA/build identifiers;
- concrete launch record;
- active Subject list;
- dashboard snapshots/aggregates for the chosen windows;
- support summary;
- moderation backlog and reviewed count;
- major incidents/rollbacks;
- top validated no-result/search gaps;
- contribution and returning-use summaries;
- decision: continue, narrow scope, pause, or expand;
- rationale and next concrete action.

No fake engagement or unsupported growth claim may be used as closeout evidence.
