import assert from "node:assert/strict";
import test from "node:test";

import { captureAuthActionLink } from "../src/features/auth/auth-deep-link";
import { createAuthActionTokenVault } from "../src/features/auth/action-token-vault";

const TOKEN = "A".repeat(43);

test("capture path rejects non-allowlisted and malformed auth action links", () => {
  const vault = createAuthActionTokenVault();

  assert.equal(
    captureAuthActionLink(
      `https://evil.example/verify-email?token=${TOKEN}`,
      vault,
    ),
    null,
  );
  assert.equal(
    captureAuthActionLink("losapuntes://verify-email?token=short", vault),
    "/sign-in?notice=invalid-action-link",
  );
  assert.equal(
    captureAuthActionLink(`losapuntes://unknown?token=${TOKEN}`, vault),
    null,
  );
});

test("vault exchanges a secret action token for a non-secret one-time handle", () => {
  const vault = createAuthActionTokenVault();
  const handle = vault.capture("email_verification", TOKEN, 1_000);

  assert.ok(handle);
  assert.equal(vault.take(handle, "email_verification", 1_001), TOKEN);
  assert.equal(vault.take(handle, "email_verification", 1_002), null);
});

test("vault refuses purpose confusion and expires tokens in memory", () => {
  const vault = createAuthActionTokenVault();
  const handle = vault.capture("password_recovery", TOKEN, 1_000);
  assert.ok(handle);

  assert.equal(vault.take(handle, "email_verification", 1_001), null);
  assert.equal(
    vault.take(handle, "password_recovery", 1_000 + 5 * 60 * 1_000 + 1),
    null,
  );
});

test("native verification links route with only an opaque handle", () => {
  const vault = createAuthActionTokenVault();
  const rewritten = captureAuthActionLink(
    `losapuntes://verify-email?token=${TOKEN}`,
    vault,
  );

  assert.ok(rewritten);
  assert.match(rewritten, /^\/verify-email\?handle=auth-[0-9]+-[0-9]+$/u);
  assert.equal(rewritten.includes(TOKEN), false);

  const handle = new URL(rewritten, "https://mobile.invalid").searchParams.get(
    "handle",
  );
  assert.ok(handle);
  assert.equal(vault.take(handle, "email_verification"), TOKEN);
});

test("native recovery links route with only an opaque purpose-bound handle", () => {
  const vault = createAuthActionTokenVault();
  const rewritten = captureAuthActionLink(
    `losapuntes://recover-password?token=${TOKEN}`,
    vault,
  );

  assert.ok(rewritten);
  assert.match(rewritten, /^\/reset-password\?handle=auth-[0-9]+-[0-9]+$/u);
  assert.equal(rewritten.includes(TOKEN), false);

  const handle = new URL(rewritten, "https://mobile.invalid").searchParams.get(
    "handle",
  );
  assert.ok(handle);
  assert.equal(vault.take(handle, "email_verification"), null);
  assert.equal(vault.take(handle, "password_recovery"), TOKEN);
});

test("invalid action tokens become a token-free error route", () => {
  const vault = createAuthActionTokenVault();

  assert.equal(
    captureAuthActionLink("/verify-email?token=bad", vault),
    "/sign-in?notice=invalid-action-link",
  );
  assert.equal(
    captureAuthActionLink(`https://evil.example/?token=${TOKEN}`, vault),
    null,
  );
});
