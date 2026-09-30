import assert from "node:assert/strict";
import test from "node:test";

import { parseAuthActionLink } from "../src/features/auth/auth-deep-link";
import { createAuthActionTokenVault } from "../src/features/auth/action-token-vault";

const TOKEN = "A".repeat(43);

test("parses only allow-listed Los Apuntes auth action links", () => {
  assert.deepEqual(
    parseAuthActionLink(`losapuntes://verify-email?token=${TOKEN}`),
    { kind: "email_verification", token: TOKEN },
  );
  assert.deepEqual(
    parseAuthActionLink(`losapuntes://recover-password?token=${TOKEN}`),
    { kind: "password_recovery", token: TOKEN },
  );
  assert.equal(
    parseAuthActionLink(`https://evil.example/verify-email?token=${TOKEN}`),
    null,
  );
  assert.equal(
    parseAuthActionLink("losapuntes://verify-email?token=short"),
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
