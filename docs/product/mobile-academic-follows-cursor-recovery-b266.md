# Mobile Academic Follows cursor recovery (B266)

The Mobile catalog search for followed institutions and programs now tracks
successfully requested cursors within the active account search. A new search
or authority change resets that history. Failed page requests leave their
cursor available to retry.

If the catalog repeats the current cursor or returns a cursor from an earlier
page, the controller preserves and deduplicates the loaded options, stops
pagination, and exposes a clear message in the screen. The safeguard applies
equally to institution and program searches.

## Validation

- Focused Academic Follows controller and screen tests: 7/7 pass
- `pnpm --filter @losapuntes/mobile check:types`
- `pnpm --filter @losapuntes/mobile format:check`
- `pnpm check:hygiene` and `git diff --check`

The complete Mobile test command currently stops during its test TypeScript
check at the inherited invalid profile fixture in
`apps/mobile/test/profile-controller.test.ts:62`, tracked separately in PR
#669. The focused Academic Follows tests pass. The Expo iOS export could not
write Metro's cache (`ENOSPC`) while C: had no free space; no source or workflow
changes were made to work around the environment limit.
