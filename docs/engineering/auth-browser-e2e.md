# Auth browser E2E

The browser smoke exercises repo-owned Identity/Auth vNext journeys against real Chromium, the Web app, the Compose API, MongoDB, and Mailpit. It creates a random local test account and completes both email verification and password recovery through the browser. For each one-time action it extracts and opens the complete URL delivered by Mailpit only after validating that its loopback origin matches the configured local Web origin. Both links must use URL fragments; the smoke verifies their bearer tokens are scrubbed from the address bar and history and never appear in browser request URLs. Recovery then completes the password reset in the Web UI, proves the old password is rejected, and proves the recovered credential can authenticate. The same disposable account is then marked `restricted` directly in the local test database: an already-authenticated browser session must revalidate into `/account/restricted`, and a fresh correct-password login must receive the same restricted routing. The synthetic account is restored to `active` in cleanup. The smoke also checks keyboard-only login at a 320×568 viewport, email/password-manager autocomplete attributes, visible focus in forced-colors mode, the HttpOnly session cookie, cookie-backed `/auth/me`, rejection of an untrusted `Origin` on logout, and successful UI logout/revocation.

The runner starts and stops the Web Vite server. It refuses non-loopback Web or API origins and never prints credentials, verification tokens, or session cookie values. Run it only against the disposable local Compose stack; it is not a production probe and does not claim provider, device, or deployed-browser evidence.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm runtime:up
pnpm test:auth-browser-e2e
pnpm runtime:down
```

On a clean Linux host, install Chromium's operating-system dependencies with `pnpm exec playwright install --with-deps chromium`. The Container runtime smoke workflow installs only the root and Web workspace dependencies, installs Chromium, starts the Compose runtime, and runs this same command.

Remaining #54 browser carriers should add revoked/expired-session UX and a controlled Google callback harness. MFA/passkeys, provider secrets, and real deployment/device evidence remain separate work.
