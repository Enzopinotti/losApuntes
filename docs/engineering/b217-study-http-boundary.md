# B217 — Study Progress real HTTP authority and disabled release boundary

**Base verified on 2026-10-25:** `main@fb52a1d681d26767d1aa2402438bf9e1954157a7`.  
**Status:** isolated Draft PR, no production activation; #353 and HIGH audit remain release HOLD.

## Why this regression block exists

Existing tests verify strict plan payloads, controller sources, and 56 real Mongo replica cases, but did not isolate the **actual NestJS/Fastify HTTP pipeline** for two independent authenticated clients with the real `AuthSessionGuard`, real `StudyProgressFeatureGuard` and the production HTTP validation/exception/cache hooks. A route may be correct at the service layer yet accidentally relax 401, 403, 503, DTO rejection or private caching over HTTP.

## Acceptance surface (no product code modified)

The fixture mounts the real `StudyProgressController` under `createHttpAdapter()` and `configureHttpRuntime()`, with real guards. Only **external** session/user lookups and the persistence service are faked: two random generated session tokens resolve to two different user IDs. No actual MongoDB, S3, external origin, network listening, registered real users or production session tokens are involved. The suite checks:

- Default `STUDY_PROGRESS_ENABLED=false`: authenticated GET, PUT and DELETE fail HTTP 503 with sanitized 5xx body; no service access.
- Missing, malformed, unknown or conflicting cookie + Bearer credentials yield HTTP 401; no service access.
- Restricted account yields HTTP 403 and revocation; credential version mismatch yields HTTP 401 and revocation.
- Two separate mobile Bearer tokens project only their respective authenticated owner IDs to the service; no-store/private caching on successful responses.
- A Web cookie uses the Web transport, not Mobile.
- Forged `ownerUserId` in request bodies and invalid revisions yield HTTP 400 before any write.
- Valid PUT and DELETE route only to authenticated owner; 404 missing progress and 409 revision conflict retain their public contract without another owner's data.
- Exact-head CI pins Node24/pnpm9, verifies frozen lock and no audit exceptions, expects exactly 8/8 real Jest HTTP cases (none skipped), checks TypeScript, strict lint and Prettier, and checks immutable SHA and clean source before and after.

## Isolation and concurrency

This PR only adds `study-progress.http-contract.spec.ts`, its static invariant script, a dedicated workflow and this document. No collisions with #713 B192 owner Mongo export, #712 Auth browser selector, #711 audit runner, #709 Expo graph, or #710 Study Runner UI. It does not modify `AuthSessionGuard`, controller, runtime, features, `pnpm-lock.yaml`, environment defaults or shared CI.

## What it does NOT certify

This suite is an **HTTP contract integration test**, not a production multi-user end-to-end login/browser test and not a Mongo persistence test: external session service, UsersService and StudyProgressService are mocked. The existing B129 real Mongo suite, B192 #713 owner projection suite, replica concurrency and two-device browser flows are complementary; none substitutes for the others. It does not demonstrate disaster recovery, legal retention policy, live backup+restore or a rollout plan.

All of #353 owner-account release acceptance remains required. In addition, `node-forge` #133 and Zod #705 HIGH vulnerability findings leave canonical production dependency audit FAIL. This PR does not suppress them or turn on `STUDY_PROGRESS_ENABLED` and must **not** be merged/released until canonical repository gates permit it.

**Release decision: HOLD / Draft / not merged / not deployed.**
