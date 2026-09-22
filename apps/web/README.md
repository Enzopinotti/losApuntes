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
