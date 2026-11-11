# Web Organizations — shareable discovery with server-bounded filters

**Base candidate:** `main@13b45569874703b293bb484482e0ecc96d383934`
**Scope:** public organization directory discovery. No API schema change, new persistent state, backend write, auth policy, dependency, lockfile or production audit waiver.
**Status:** candidate for review, exact-head GitHub CI and manual browser acceptance.

## Behavior

- The public `/organizations` directory now accepts canonical URL filters for text (`q`, trimmed 2–120 characters), type (nine known organization kinds), verification (`verified`/`unverified`) and academic institution (`institutionId`, UUID v4).
- Text, type and verification controls are drafts until pressing **Buscar**. Changes to these controls do not trigger network queries while typing. The committed URL is the only authority for list fetch and cursor pagination.
- Selecting a canonical institution updates only the `institutionId` URL parameter immediately while preserving the applied text/type/verification. The linked institution ID remains active after reload even without a separate API lookup for its name (placeholder: `la institución del enlace`). Re-select a canonical institution to display its full name. Removing the institution filter preserves the other applied filters.
- Back/Forward/reload restore the applied URL. A link can be shared with **Copiar búsqueda** or **Abrir enlace compartible**; the serialized public URL contains only the four recognized discovery parameters.
- **Limpiar todos los filtros** removes all four filters and keeps other router state, never inventing a new authorization scope.
- A malformed, duplicated or overlong URL value suspends discovery with explicit recovery copy and **no** request; it must not silently broaden into a public unfiltered query.
- Cursor pages retain their prior scope-authority fence, bounded API limit, distinct per-filter cursor history and loop protections.

## Privacy and security

Only public search parameters leave the browser in the copied link. A cursor, private route `id`, auth token, session identifier or other search key is not serialized. Query values are URL-encoded through `URLSearchParams`; the API continues enforcing the same DTO validation and user authorization.

Neither verification badges nor organization membership privileges change. The directory never assumes a user is entitled to follow/manage an organization based on the new link. Mutation paths retain API authorization.

## Quality and acceptance

- `pnpm test:web-organizations-contract` runs the added pure Node URL tests and established organization search/pagination and presentation contracts, including malformed/duplicate filters, type/status bounds, institution retention, clearing and share privacy.
- Exact-head canonical `pnpm check`, Node 24 Prettier/TypeScript and strict API lint, critical domain coverages, runtime smoke and production dependency audit are mandatory to merge.
- Manual acceptance to perform separately: anonymous reload from shared URL, Back/Forward with draft changes, institution selector with API lookup, keyboard and mobile layouts, stale filter/cursor transitions and malformed link recovery.
- Known production HIGH dependency advisories continue to block release until remediated; do not waive audit or declare `main` integrated.

Reconcile the Frontend backlog before marking this feature delivered.
