# Auth browser E2E

The browser smoke exercises repo-owned Identity/Auth vNext journeys against real Chromium, the Web app, the Compose API, MongoDB, and Mailpit. It creates a random local test account and completes email verification through the browser. The verification link must use a URL fragment; the smoke verifies the token is scrubbed from the address bar and history and never appears in a browser request URL. It also checks keyboard-only login at a 320×568 viewport, email/password-manager autocomplete attributes, visible focus in forced-colors mode, forgot-password navigation, the HttpOnly session cookie, cookie-backed `/auth/me`, rejection of an untrusted `Origin` on logout, and successful UI logout/revocation.

The runner starts and stops the Web Vite server. It refuses non-loopback Web or API origins and never prints credentials, verification tokens, or session cookie values. Run it only against the disposable local Compose stack; it is not a production probe and does not claim provider, device, or deployed-browser evidence.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm runtime:up
pnpm test:auth-browser-e2e
pnpm runtime:down
```

On a clean Linux host, install Chromium's operating-system dependencies with `pnpm exec playwright install --with-deps chromium`. The Container runtime smoke workflow installs only the root and Web workspace dependencies, installs Chromium, starts the Compose runtime, and runs this same command.

Remaining #54 browser carriers should add revoked/expired-session UX, restricted-account routing, and a controlled Google callback harness. Password recovery completion, password-reset action-link handling, MFA/passkeys, provider secrets, and real deployment/device evidence remain separate work.
