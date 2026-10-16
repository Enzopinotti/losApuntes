# B84 — Mock contracts for AccountExportService (strict ESLint)

Date: 2026-10-16. **Stacked base:** B83 [#388](https://github.com/Enzopinotti/losApuntes/pull/388) exact HEAD `b75c68012110c94dbe9e89ee3a4d7e03b0b25ec4`, which inherits the canonically formatted B82 source.

## Root cause and scope

The prior global [B83 verify](https://github.com/Enzopinotti/losApuntes/actions/runs/38905581541) passed 10/10 critical coverages and API/Web/Mobile formatting, but API ESLint reported 380 errors + 109 warnings (489 problems) in 16 files. Of those, 25 errors arose from `apps/api/src/data-lifecycle/domain/account-export.service.spec.ts`: primarily detached interface method references to Jest matchers (`@typescript-eslint/unbound-method`), followed by unnecessary `async` callbacks without `await` and one escaped apostrophe.

The original fixture presented a plain object of `jest.fn()` methods as `jest.Mocked<AccountExportStore>` to both the production service **and the tests**. This made matchers see type-declared object methods rather than Jest function properties, raising `unbound-method` despite the runtime mocks being independent of `this`.

## Change

- Add a **generic typed test helper** whose mock argument tuple and Promise return value derive from `AccountExportStore[K]` with `Parameters` and `ReturnType`. The *fixture* exposes its underlying Jest functions to tests, while the service receives the narrow structural `AccountExportStore` interface. This avoids both method detachment warnings and indiscriminate `any` casts.
- Preserve `UsersService` methods as Jest function properties in the fixture; only adapt at the service constructor boundary.
- Replace eight unnecessary `async (...) => ({ ... })` request mocks with `(...) => Promise.resolve({ ... })` to preserve asynchronous completion, rejection behavior and typed owner/format arguments.
- Remove one needless apostrophe escape in a test name.
- **No production source changes:** request/claim/retry, epoch guards, account privacy, Mongo completion CAS and S3 generation fences are unchanged. Tests continue to assert the same call counts and arguments.

## Proof and limitations

The read-only `B84 Account Export Service Mock Quality` workflow runs on the exact PR HEAD with Node 24 and a frozen pnpm lock: ESLint `--max-warnings=0` and pinned Prettier **on the one changed spec**, the real Jest suite and full API `check:types`. After a passing focused gate, run global `verify` to measure reduction of API lint errors on the stacked commit; never assert the entire Quality Gate is green solely from the focal result.

Current main later received an independent expired-claim Mongo completion race fix `d9bc2ae79a27f71d58f3d18c4b8786befd064c4f` affecting `account-export-processor.ts/spec.ts` and Mongo stores. **Do not overwrite those files** with an older test snapshot; this carrier touches neither. The already active #387 covers separate Mongo integration fixtures. Future integration must preserve those respective source contracts, compare against current main and execute exact-HEAD checks.

No ESLint rules disabled, no exception extensions, no S3/delete relaxation. Issue #353 release remains **HOLD**, with no app startup or deploy.
