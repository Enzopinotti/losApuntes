# Web

React/Vite client for Los Apuntes.

The historical frontend was rescued from branch `frontend` at `4d481ad922bfed8ce4dbc6418a5111cfd6daefe0`, but Identity/Auth now consumes the real backend contract.

## Auth rules

- Web restores identity with `GET /auth/me`.
- The bearer session token is never exposed to browser JavaScript.
- The browser session lives in the backend-issued HttpOnly cookie.
- Web requests use credentials.
- Network failure is not treated as logout.
- Login/register/recovery/verification branch on stable API codes.
- Google is shown only when the backend reports the Web provider as enabled.
- Security settings expose password, active sessions and login methods.
- The repository hygiene gate forbids the historical fake auth API and bearer-token persistence in browser storage.

Configure the API origin with `VITE_API_BASE_URL`. Local default is `http://localhost:4000`; see `.env.example`.

## Release qualification

Every Vite build emits `dist/release.json`.

The manifest is deliberately fail-closed:

- local/dev builds may emit `{"status":"unavailable","service":"web"}`;
- an observable release is emitted only when `VITE_RELEASE_ID`,
  `VITE_RELEASE_SHA` and `VITE_API_BASE_URL` are all explicit and valid;
- `VITE_RELEASE_SHA` must be the exact 40-character Git SHA used to build the
  Web artifact;
- `VITE_API_BASE_URL` must be one absolute HTTP(S) origin with no credentials,
  path, query or fragment;
- production qualification requires HTTPS and an API `/health/release`
  observation from that exact origin with the same source SHA.

`release.json` contains only bounded, non-secret deployment identity. It is
evidence, never authority for authentication or API permissions. The public
edge still owns the cache policy for the SPA shell, `release.json` and hashed
assets; real cache-header evidence remains a deployment gate under #83/#80.
