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

`WebErrorBoundary` catches render failures and keeps a usable recovery surface even when the diagnostic sink itself fails. Its action reloads the page so a failed render tree is not reused. React root callbacks replace default raw error logging with the safe envelope; caught render errors are reported by the boundary exactly once. Global `error` and `unhandledrejection` handlers report through the same envelope and cancel only the browser's default raw console serialization; they do not stop propagation or change application execution. Feature/network failures handled by the application are not intercepted by these global hooks.

Version and build metadata fail closed unless they match a public numeric semantic version (with only the `alpha`, `beta` or `rc` prerelease labels), numeric build identifier, or `web-<number>` build label. Arbitrary sanitized strings could still carry user or token material, so character replacement alone is not accepted as redaction.

No external provider is selected in this carrier. The sink can be replaced later only behind the same envelope contract.

V1 does not retry diagnostic delivery. Asynchronous sink failures are swallowed, so a failing endpoint cannot amplify an error into a retry storm; any future provider adapter must add its own bounded dedupe/rate policy.

## Release metadata

The Web build may inject:

- `VITE_APP_VERSION`;
- `VITE_BUILD_ID`;
- `VITE_RELEASE_SHA`.

Missing metadata stays `null`; invalid revision data fails closed to `null`. Release qualification remains governed by the dedicated release contract and external deployment evidence.

## Verification

`pnpm test:web-observability-contract` executes the actual diagnostic functions under Node 24 and proves that representative tokens, email addresses, signed-query material, arbitrary names and local source paths do not enter the serialized envelope. It also verifies sink isolation and reversible global-handler installation.
