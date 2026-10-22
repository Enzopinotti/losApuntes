# Study Web — TypeScript and academic-context guard

## Why this matters

Two existing TypeScript errors were blocking the Web build: an obsolete `normalizeStudyKitArchive` import in the portable kits screen, and a nullable `subjectId` passed to `emptyStudySession` when clearing the current study plan.

The session's academic subject is scoped to the authenticated context, and it can become unavailable between render and click. The clear-draft handler now checks `subjectId` **before** confirmation or state mutation. If there is no current subject, no draft is created or cleared. This is not a type assertion; it enforces the authoritative subject requirement at runtime.

Portable kit parsing, normalization, study handoff and privacy controls remain untouched; the obsolete import alone is removed.

## Automated acceptance

- `node scripts/test-web-study-type-guards.mjs` enforces the guard-before-confirmation ordering and ensures the subject remains derived from the current academic context.
- The path-filtered `study-web-types` workflow checks out the exact PR head and runs the Web TypeScript project under the pinned Node/pnpm workspace.
- The runtime application, browser and database are **not** started; manual acceptance remains deferred.
- Passing this workflow does not imply the repository-wide Quality Gate or security audit are green. Formatting debt in other areas and audit exceptions are tracked separately.

No API routes, storage formats, dependencies, workspace configuration, or session permission models are changed in this fix.
