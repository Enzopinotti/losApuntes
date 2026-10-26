# Mobile Academic Follows cursor recovery (B266)

The Mobile catalog search for followed institutions and programs now tracks
successfully requested cursors within the active account search. A new search
or authority change resets that history. Failed page requests leave their
cursor available to retry.

If the catalog repeats the current cursor or returns a cursor from an earlier
page, the controller preserves and deduplicates the loaded options, stops
pagination, and exposes a clear message in the screen. The safeguard applies
equally to institution and program searches.

## Validation after reconciliation with main

- Focused controller and screen tests: 9/9 passed, including a late page after
  restarting the same program query and retaining new options on a cyclic page.
- Full Mobile suite: 775/775 passed.
- Prettier on affected TypeScript files and git diff --check passed.
- The profile fixture correction from #669 is now present in main.

Native device acceptance was not run. No CI was started or retried.
