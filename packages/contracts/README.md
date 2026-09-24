# Contracts

Shared transport contracts for Los Apuntes clients.

Rules:

- contracts describe public API payloads, not persistence models;
- server-side authorization remains authoritative;
- no secrets, provider credentials or database-specific types belong here;
- Web and Mobile may consume these contracts, but UI state machines stay client-owned.

Current contract slices:

- `src/auth.ts` — Identity/Auth request/response types and stable error codes.
