# B82 — Canonical formatter on top of B81, preserving B80 export

**Date:** 2026-10-16. **Functional parent:** [B81 #383](https://github.com/Enzopinotti/losApuntes/pull/383) `0ad2aa672711d315fe5dc38cff75a5df3f5f92ff`, itself based on `main@3579eab49f9d0ad3dd889731695f7a1a155e7efd` (B80). The B82 branch also merged current `main@a27a4e2a60f3ea993ee2d52e5303a55a33981a49` (B81 S3 multipart abort guard), after GitHub proved zero changed-path overlap with its 14 B81/B82 paths. The resulting exact-head merge commit is `03118f3162aa051f3aecb0f33471e4a3a8b541c9`, with both parent SHAs retained and no force updates. The original format PR [#377](https://github.com/Enzopinotti/losApuntes/pull/377) started from a pre-B81 source snapshot, and copying files from it would risk overwriting owner epoch, Study Collections CAS and B80 S3 write-ahead changes.

## Scope

1. Port only the **semantic React hook-dependency repairs** from #377 to the currently integrated B81 sources. `StudyKits` derives a stable selection of validated resource UUIDs plus selected kit ID, and each verification reads that snapshot under its authority ticket. `StudyRunner` observes the primitive clock started-at value in its interval instead of omitting mutable `activeClock` object from dependency validation. No new authority/permission behavior, storage format, or HTTP endpoints.
2. The temporary, branch-restricted `B82 format combined B81 sources once` workflow installs the project's locked `pnpm@9.15.9` and Node 24, executes `pnpm --filter @losapuntes/web format` and `pnpm --filter @losapuntes/api format` **on the exact B81-based SHA**. The result can update only `reconcile/b82-pinned-format-on-b81-current-main`, using a strict expected-head remote lease and a path allowlist for source TS/TSX. No change to `main` or other PRs.
3. The same workflow checks formatting, Web lint, Web types and API types on the formatted tree. A full new `verify` run on the formatted SHA is required separately: the original formatter workflow is not sufficient evidence for ten domain coverages or production auditing.

## Invariants and release gates

- Preserve CAS postconditions, owner epoch at prepublish, 32-section v3 allowlist, frozen v1/v2 manifests, B78/B79 queue-only S3 cleanup and B80 write-ahead ledger.
- Formatter must modify **only** Web/API TS/TSX source/test files. No scripts, dependencies, lockfiles, CI thresholds, security exception dates, API contracts, authorization boundaries, DB schema or S3 cleanup semantics.
- GitHub `verify` retains all original domain and build checks; never mark B82 integrated solely because Prettier succeeds. `ACCOUNT_EXPORT_FORMAT_VERSION=1`, disabled Study Progress, release issue #353 **HOLD**.
- Security audit still blocks on the expired `node-forge` exception (#133) and security issue #141. No automatic waiver, ignoreCVE addition or audit threshold reductions.
- If a newer `main` lands, compare changed paths and rerun exact-head validation before proposing a merge. Do not force merge, launch services, or deploy.

## Previous evidence

B81 [focal #38902042984](https://github.com/Enzopinotti/losApuntes/actions/runs/38902042984) passed six suites, 72 tests, API types and B77/B78/B79 contracts. [Global #38902043042](https://github.com/Enzopinotti/losApuntes/actions/runs/38902043042) passed 10/10 critical API coverage jobs but was red for old Web/API formatting and audit. **Those results are historical, not evidence for B82 HEAD.**

## Resultados del formateador y retiro del permiso de escritura

[Run #38903519454](https://github.com/Enzopinotti/losApuntes/actions/runs/38903519454) **SUCCESS**. Partió del SHA `5f90b80859c433515cb97a05c0b35a7810d5e2fc`, verificó el remote HEAD, instaló workspace congelado, formateó y publicó en **su propia rama** el commit `36704a80e2ec8761b610863b96da668f92fe6859`. La comparación de Git confirmó **58 archivos fuente** modificados: **48 API, 10 Web**, todos dentro de la allowlist TS/TSX. El job también completó en verde `format:check` API/Web, `lint` Web y `check:types` API/Web sobre el árbol ya formateado. Esto no sustituye el CI global.

El workflow temporal de formateo, que poseía autorización restringida `contents: write`, se **retira de la rama candidata en el mismo commit que esta evidencia**. La fuente formateada permanece, pero ya no hay un workflow especial con permisos de escritura en el PR final. El siguiente `verify` debe ejecutarse sobre el nuevo SHA sin workflow temporal, y reportar por separado Quality Gate, diez coberturas, auditoría y runtime.
