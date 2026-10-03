# Web observability v1

Los Apuntes Web reports only a bounded, provider-neutral diagnostic envelope. It is recovery evidence, not a second logging channel and not application authority.

## Allowed envelope

- platform: fixed to `web`;
- app version/build when explicitly injected by the release environment;
- release revision only when it matches a bounded hexadecimal Git-style revision;
- normalized route surface without query, fragment or arbitrary identifiers;
- allowlisted JavaScript error class;
- deterministic fingerprint derived only from error class + normalized surface;
- timestamp.

The v1 envelope deliberately emits `stack: null`. Raw error messages, component stacks and browser stack traces can contain names, tokens, signed URLs, local paths, query strings or other private material and therefore are not emitted.

## Recovery behavior

`WebErrorBoundary` catches render failures and keeps a usable retry surface even when the diagnostic sink itself fails. Global `error` and `unhandledrejection` handlers report through the same envelope and never call `preventDefault`, replace browser error handling, or convert expected feature/network failures into authority.

No external provider is selected in this carrier. The sink can be replaced later only behind the same envelope contract.

## Release metadata

The Web build may inject:

- `VITE_APP_VERSION`;
- `VITE_BUILD_ID`;
- `VITE_RELEASE_SHA`.

Missing metadata stays `null`; invalid revision data fails closed to `null`. Release qualification remains governed by the dedicated release contract and external deployment evidence.

## Verification

`pnpm test:web-observability-contract` executes the actual diagnostic functions under Node 24 and proves that representative tokens, email addresses, signed-query material, arbitrary names and local source paths do not enter the serialized envelope. It also verifies sink isolation and reversible global-handler installation.
