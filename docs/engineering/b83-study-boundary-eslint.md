# B83 — Strict ESLint for study and export boundaries

Date: 2026-10-16. Stacked on [B82 PR #386](https://github.com/Enzopinotti/losApuntes/pull/386), exact parent `e119fd49ff43dcc026f5757d1cfebb4e1282355a`. The functional parent already passes all ten API critical coverage jobs, pinned format API/Web/Mobile and Web ESLint/TypeScript, but full API ESLint reports **390 errors and 109 warnings** across 16 files. The release audit is separately blocked by an expired `node-forge` exception.

## Isolation and fixed findings

Target bounded issues where a typed production interface or read-only boundary is already correct but ESLint cannot prove safety:

- **Feature guards:** preserve Nest `CanActivate` context method signature while explicitly acknowledging its unused global context. Both feature switches still throw 503 while disabled; no rollout flags changed.
- **Portable private study plan:** replace the control-character regex ESLint rejects with a bounded explicit ASCII codepoint scan, preserving the exact rejection set U+0000–U+001F and U+007F, and preserving trim/whitespace normalization before the scan. Remove two unnecessary assertions only *after* the validator has narrowed `task.kind` and `startsAt`. Add tests for control characters in titles and notes and normalized whitespace. Limits remain 24 tasks, 1,200 minutes, per-item 5–120 minutes, 64 KB and owner/subject validation.
- **Collection/progress owner export readers:** remove redundant non-null assertions on the last row after the existing `page.length > 0` guard, without changing pagination, cursor privacy or Mongo select fields. Keep exports fail-closed on malformed private documents.
- **V1/V2/V3 account-export versioning fixtures:** replace three unnecessary `async` callbacks with explicitly resolved promises, preserving the awaited read and epoch/commit order. No change to backend export code, allowlist or S3.
- **No overlaps with #385**: Mongo integration testing lanes `study-collection-lifecycle.mongo-int.spec.ts` and `study-progress.mongo-int.spec.ts` remain untouched. The source version of #386 remains the sole stacking base.

## Acceptance and integration order

This PR targets `reconcile/b82-pinned-format-on-b81-current-main` (stacked). Its SHA must be tested with **zero-warning ESLint for each modified source and test**, pinned Prettier, six targeted Jest suites, and entire API `check:types`. The parent is not modified.

A passed focal gate is **not** a green global gate. After B83's branch is integrated onto B82, rerun full `verify` on exact combined SHA; remaining API lint errors, production audit and runtime smoke remain blocking. Do not add ESLint ignores, disable rules, extend audit exceptions, merge to main or deploy. Issue #353 remains HOLD.

Security constraints are unchanged: all private exports are owner-scoped, auth/subject guards stay authoritative, S3 cleanup fences and B80/B81 multipart/write-ahead guarantees stay intact.
