# Web Study Workbench source pagination recovery

The Study Workbench keeps separate cursor histories for saved resources and discoverable resources, scoped to the selected viewer and subject. A source stops when a page returns its own cursor or a cursor already consumed by that source; received items remain visible and are deduplicated by resource ID.

Each source can be refreshed from its first page. Transient page failures preserve the current cursor and loaded items for retry. Expired sessions, revoked access, and missing sources clear the affected list. Saved-resource stale-cursor responses keep the visible items but require a refresh before paging again.

The change does not modify resource permissions or the API pagination contract.

`node scripts/test-web-study-workbench-b176-browser.mjs` exercises source
independence, cursor-cycle deduplication, retry after a 500 response and source
clearing after 401/403/404 in Chromium with simulated API responses.
