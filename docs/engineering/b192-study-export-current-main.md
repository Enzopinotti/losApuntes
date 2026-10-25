# B192 — Private Study Progress read and owner-only export on current main

**Reconciled on:** 2026-10-25. **Base:** `main@fb52a1d681d26767d1aa2402438bf9e1954157a7`.  
**Source evidence:** historical Draft #600 (`6de9e8c331e7549b9c2188374a024624d5703f2c`), superseding alternative carriers #522 / #526 / #530 / #540 only **after** full verification, not by assumption.

## Problem and boundary

B61 Study Progress stores private plans on the server. The owner `GET` previously echoed the persisted `plan` without rerunning schema validation. A malformed/historical record could therefore leak unexpected fields. The owner export reader previously trusted the storage adapter's ordering, page length, and timestamps when building v3 account portability. A broken cursor or duplicate could silently repeat or skip private data.

The current main already supports account export format v3 and the `study.progress` owner contributor. This carrier does **not** invent new account export endpoints, grant access to third-party Resources, or change who owns a plan.

## Changes

1. **Fail-closed owner GET/PUT projection:** reparse stored plan against the exact normalized requested subject ID; assert the stored owner matches the authenticated owner, and require valid revision and chronological dates. The 404 for missing progress stays different from the sanitized 500 `STUDY_PROGRESS_STORED_INVALID` for corrupt persisted content. Unexpected fields/tokens are never included in responses.
2. **Owner-scoped portable pagination:** use the existing owner filter and immutable subject cursor; verify lookahead, row budget, canonical strict ascending Subject UUIDs and timestamps before returning any page. Duplicates and overlapping continuation fail closed.
3. **Coverage:** Jest exercises corruption, mismatched subjects, invalid revisions/dates, bounded pages, cross-user cursors, adapter misordering and missing progress vs database failure. B61/B62 static regression contracts are brought into line with the current safer conflict refresh and exact Mongo projection.
4. **Web Security export v3:** show an informational notice only for a completed/downloadable v3 export. It explains this copy may include the owner's study progress but never transfers access to other people's material. Previous v1/v2 response formats remain valid.
5. **Exact-head verification:** one dedicated Node 24 workflow with frozen pnpm lock, focused Jest, B61/B62/Web contracts, API/Web typecheck and builds. The canonical global verify still controls quality, Chromium runtime, domain coverage and production dependency audit.

## Changed-path and concurrent lane reconciliation

For each existing source file brought from #600, `main@fb52a1d...` has the **same content blob** as the old `main@bff19f4...` base of #600; only the narrowly relevant file content is carried, not the stale Git history or obsolete workflow. This PR does not touch `.github/workflows/ci.yml`, `pnpm-lock.yaml`, authentication, Expo/Mobile, or Study Runner (#710). The Web edit is limited to the previously agreed account-export panel; unrelated UI remains owned by Agente B. No colliding path with the current security carrier #711 or Auth carrier #712.

## Risk and acceptance — HOLD

- `STUDY_PROGRESS_ENABLED=false` remains the production default and runtime validation still rejects enabling it in production without #353 acceptance.
- No data migrations, schema bypass, dependency overrides, audit waivers or deployments.
- **Pending independent acceptance #353:** actual two-account/two-device browser exercise, replica-set concurrent revision conflicts, limits/indices, backup + restore with isolated data, retention/portability with closed accounts and privacy/legal product decisions.
- The global HIGH/CRITICAL audit remains blocking. At the last observed exact-head audit (PR #711), unresolved HIGH advisories are `node-forge` (#133) and Zod (#705); historical braces advisory #141 was withdrawn on 2026-10-23. This note does not replace a fresh audit on this candidate.
- Historic #600 results and partial green jobs on other SHAs are NOT evidence for this candidate. The new PR must preserve its own SHA and verification links.

**Status until proven otherwise:** IMPLEMENTED in isolated branch; tests pending; NOT MERGED; NOT RELEASE-READY; NOT DEPLOYED.
