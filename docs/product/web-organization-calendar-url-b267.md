# B267 — HTTPS event links in Web organization calendars

## Motivation and source
The historical #659 PR implemented an RFC 5545 `URL` property but was based on an old shared serializer. Current `main` uses `apps/web/src/features/organizations/organization-event-calendar.mjs` and has since fixed subsecond calendar interval handling in #643. This carrier ports **only URL validation and output**, retaining `toCalendarDate(value, roundUp)`, strict `endTime <= startTime` rejection, byte folding, and all existing calendar behavior.

## Behavior
- A scheduled event with a canonical HTTPS external URL gets the `URL` property in its exported `.ics` and preserves the validated link in the optional description.
- Reject malformed, HTTP/non-HTTPS, embedded-credential, control-character, whitespace-internal and longer-than-2048-character external URLs. Rejected links appear in neither `URL` nor `DESCRIPTION`.
- UTF-8 line-folding continues at 75 octets; no calendar import requires additional API calls.
- The event's existing visibility and permission checks continue unchanged; exporting a public URL does not grant access or alter ownership.
- Invalid/cancelled events still produce no calendar, and positive fractional-second intervals remain preserved.

## Atomic change log
1. Fail-closed external URL policy, used for both `DESCRIPTION` and `URL`.
2. RFC 5545 event `URL` property serialization.
3. Regression tests for valid/query links, malicious and malformed links, and folded long URLs.
4. This migration note and verification gate.

## Acceptance and risk
Run `node --test scripts/test-web-organization-event-calendar.test.mjs`, `pnpm test:web-organizations-contract`, Node 24/pnpm 9 frozen quality checks, Web types/lint/format/build, ten critical coverage checks and runtime smoke against the exact PR head. The full `pnpm audit --prod --audit-level high` remains mandatory. Do not relax policy or claim green release while #133 node-forge and #705 Zod are outstanding.

No changes to Auth, API, backend, Mongo, permissions, contracts, package dependencies, lockfile, flags or CI bypass. Source #659 remains open until this replacement is verified; never merge both branches.
