# B128 — strict Jest mock typing in account export processor

**Base:** `main@0151055dc881e7912327293de0fe1b8ba57c5121` (B127). **Gate:** #353 remains OPEN/HOLD, Study Progress disabled.

## Reproduced lint debt

Global `verify #39182853558` after B127 passed all 10 critical coverages and full repository formatting; Quality Gate stops in strict API ESLint with **451 errors and 77 warnings** (0 allowed). Its diagnostics are concentrated in two big opt-in/processor fixtures:

- `account-export-processor.spec.ts`: **202 errors**, mostly `@typescript-eslint/unbound-method` when Jest receives a spied mock as an unbound function.
- `study-progress.mongo-int.spec.ts`: **164 errors and all 77 warnings** from dynamic Mongo fixtures and unsafe `any`, to be addressed independently with real Mongo acceptance.
- Several smaller export and lifecycle fixtures account for the remaining errors.

## Selected high-leverage fix

Recover **only** the reviewed type-safe changes for `account-export-processor.spec.ts` from prior quality PR #437, not the old full branch. Before replacing the fixture, verified both files contain the **exact same 83 named Jest test cases in the same order**. The touched spec retains those scenarios for lease loss, S3 abort, retries, owner-epoch protection, CAS, expiration and safe export publication.

The remediation asserts against **`.mock.calls`** on typed `jest.fn` mocks rather than passing standalone method references to Jest matchers. Where Jest matchers such as `expect.any(Date)` are intentionally dynamic, accept their values as `unknown` (without making runtime tests permissive), while actual mock calls continue to be checked with `toContainEqual` and explicit expectations. No `eslint-disable`, `any` escapes or test removals.

## Real acceptance and exclusions

Read-only `.github/workflows/b128-export-processor-typed-lint.yml` checks frozen Node24/pnpm, strict zero-warning ESLint and pinned Prettier on the touched file, entire processor Jest suite, full API TypeScript and clean Git SHA. A separate diagnostic job measures **full unchanged API lint**, requiring an actual reduction from 451 errors and no increase from 77 warnings; this inventory is **not a waiver** and cannot replace the existing failing `pnpm check` / global `verify` gate.

B128 makes no change to product code, account export format, S3 signing, Mongo schema, dependency policy or release features. Audit exception for `node-forge@1.4.0` / CVE-2026-85393 expired 2026-10-15, issue #133; this remains a hard security HOLD. #141 and external S3/browser/restore are also not certified.

## Executed red-green evidence and quantified improvement

**First exact-head run**, [B128 #39185154372](https://github.com/Enzopinotti/losApuntes/actions/runs/39185154372), SHA `58e9c1349298e105eb5880dc3a3b51156a0416bb`: **2/2 scoped jobs SUCCESS**:
- Targeted `eslint --max-warnings=0` of the processor spec: **0 errors / 0 warnings**.
- Pinned Prettier of the spec: **PASS**.
- Full Jest file, with unfiltered test names: **86/86 tests PASS, 1/1 suites**; its **83 distinct named scenario declarations** preserve the original parameterized cases.
- Whole API TypeScript: **PASS**.
- Global API strict lint inventory, unchanged commands: **249 errors / 77 warnings**, versus previous **451 errors / 77 warnings**: **202 errors eliminated (44.8% fewer)**. The inventory report does not waive the canonical `pnpm check`: API strict lint is still a genuine FAIL.

[Global `verify #39185154347`](https://github.com/Enzopinotti/losApuntes/actions/runs/39185154347) on that same SHA: **all 10 critical coverage jobs PASS**, Quality Gate still FAIL (remaining strict lint), Production dependency audit FAIL due the pre-existing expired 2026-10-15 `node-forge` exception, smoke skipped. The next largest lint blocker is `study-progress.mongo-int.spec.ts` (~164 errors plus all 77 warnings); separate real-Mongo acceptance and typing review is required.

The documentation commit changes the SHA; final PR integration must confirm new exact-head checks remain consistent rather than treating the preceding run as proof for a later SHA.
