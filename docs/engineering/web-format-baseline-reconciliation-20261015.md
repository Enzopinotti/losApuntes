# Web canonical formatter baseline — 15 October 2026

## Scope

The main Web Quality Gate was blocked before lint and tests because seven pre-existing TS/TSX files diverged from the repo's pinned Prettier output.

This change applies **only the exact Prettier-generated diff** to:
- `apps/web/src/features/resources/services/resourcesService.ts`
- `apps/web/src/features/study-collections/studyCollectionsService.ts`
- `apps/web/src/pages/StudyCollections.tsx`
- `apps/web/src/pages/StudyKits.tsx`
- `apps/web/src/pages/StudyPractice.tsx`
- `apps/web/src/pages/StudySession.tsx`
- `apps/web/src/pages/StudyWorkbench.tsx`

The patch was obtained from the **exact-HEAD** diagnostic CI, with 111 unified-diff hunks checked against the original file content before updating. The temporary diagnostic step was replaced with the permanent read-only `prettier --check` and Web TypeScript checks. Each file is committed separately. No production behavior, authorization, schema, lockfile, dependency or security-exception changes are intended.

## Parallel carril coordination

These are **expected integration overlaps, not current merge conflicts**:

| PR | Shared files | Safe sequencing |
|---|---|---|
| #316 persistent study collections | `studyCollectionsService.ts`, `StudyCollections.tsx` | Preserve the author's functional diff, then re-run Prettier on merged files |
| #333 Study Web subject guard | `StudyKits.tsx`, `StudySession.tsx` | Preserve the new academic-subject guard and remove only merged whitespace differences |
| #341 focused active-recall | `StudyPractice.tsx`, `StudyWorkbench.tsx` | Keep question verification and focused practice features, then re-run Prettier |
| #329 Search saved-resource action | No shared file | Independent |
| #338 academic Q&A | No shared file | Independent |
| #318 private export, #317 Mobile Search | No shared file | Independent |

GitHub `mergeable` on a PR's own branch does **not** prove that merging this formatter baseline before those functional PRs will leave them conflict-free. Rebase/reconcile each author branch against the newly integrated `main` **only after** checking its latest HEAD and preserving functional changes. Do not force-update other agents' work.

## Remaining security gate

- `node-forge@1.4.0` (GHSA-86w9-cpqp-85rv) has no upstream patched version confirmed on 2026-10-15. The exact exception #133 expired at `2026-10-15T00:00:00.000Z`.
- `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm, #141) also has no upstream patched version confirmed; the high-severity report must remain **visible**.
- **Do not** extend expiry, suppress audits, introduce unreviewed forks/patches, or claim release clearance from a formatting pass.
- Required next step: independently review runtime reachability and a supported upstream dependency graph change, then rerun exact-head production audit. If no remediation exists, retain the failure and plan mitigations with explicit risk ownership.

## Acceptance

The read-only `Web baseline formatting` job checks Prettier of exactly these seven sources and Web TypeScript, on the PR's exact HEAD. The canonical repo `pnpm check` remains unchanged; all API domain coverage and security audit jobs remain authoritative.

No application, browser, server or database process was started as part of this work.
