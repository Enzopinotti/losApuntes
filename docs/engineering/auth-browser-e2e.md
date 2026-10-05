# Auth browser E2E

The browser smoke exercises one repo-owned Identity/Auth vNext slice against a real Chromium browser, the Web app, the Compose API, MongoDB, and Mailpit. It creates one random local test account, verifies it through the captured Mailpit message, then checks Web login, the HttpOnly session cookie, cookie-backed `/auth/me`, rejection of an untrusted `Origin` on logout, and successful UI logout/revocation.

The runner starts and stops the Web Vite server. It refuses non-loopback Web or API origins and never prints credentials, verification tokens, or session cookie values. Run it only against the disposable local Compose stack; it is not a production probe and does not claim provider, device, or deployed-browser evidence.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm runtime:up
pnpm test:auth-browser-e2e
pnpm runtime:down
```

On a clean Linux host, install Chromium's operating-system dependencies with `pnpm exec playwright install --with-deps chromium`. The Container runtime smoke workflow installs only the root and Web workspace dependencies, installs Chromium, starts the Compose runtime, and runs this same command.

The next #54 browser carriers should add the remaining bounded journeys: revoked/expired-session UX, action-link navigation and URL scrubbing, autofill/restricted-account behavior, and a controlled Google callback harness. Password KDF benchmarking, MFA/passkeys, provider secrets, and real deployment/device evidence remain separate work.
