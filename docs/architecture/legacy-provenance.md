# Legacy provenance

This reboot intentionally rescues source instead of merging historical branches.

## Frozen sources

- main base: `5c0e677c7c8b6f8d5b774aae8b094ae128748292`
- frontend source: `4d481ad922bfed8ce4dbc6418a5111cfd6daefe0`
- backend source: `51b67bb71c4ec03d9b94963fc139695140c5563d`

## Frontend rescue

The historical `frontend/` application is relocated under `apps/web/` without pretending its fake authentication is production behavior.

## Backend rescue

Only source, tests and tool configuration are rescued under `apps/api/`.

Explicitly excluded:

- `backend/node_modules/**`
- `backend/data/**` including WiredTiger database files
- historical Mongo docker-compose runtime state
- generated/runtime artifacts

Mongo/Mongoose remains legacy implementation evidence only. The 2026 persistence decision is still open until the real DER/class diagrams are reconciled and an ADR is accepted.

## Why not merge

The backend branch contains more than 37,000 tracked entries because generated dependencies and physical database state were committed. A direct merge would preserve that active tree and make the reboot harder to reason about.
