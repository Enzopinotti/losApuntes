import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthActionTokenVault,
  type AuthActionTokenVault,
} from "../src/features/auth/action-token-vault";
import { completeEmailVerification } from "../src/features/auth/email-verification";
import type { EmailVerificationApi } from "../src/features/auth/email-verification";

const TOKEN = "V".repeat(43);

const makeApi = (overrides: Partial<EmailVerificationApi> = {}) => {
  const calls: string[] = [];
  const api: EmailVerificationApi = {
    inspectEmailVerification: async ({ token }) => {
      calls.push(`inspect:${token}`);
      return { verification: { available: true } };
    },
    completeEmailVerification: async ({ token }) => {
      calls.push(`complete:${token}`);
    },
    ...overrides,
  };
  return { api, calls };
};

const vaultWithHandle = (
  now = Date.now(),
): { vault: AuthActionTokenVault; handle: string } => {
  const vault = createAuthActionTokenVault();
  const handle = vault.capture("email_verification", TOKEN, now);
  assert.ok(handle);
  return { vault, handle };
};

test("verification consumes an opaque handle, inspects first, then completes", async () => {
  const { api, calls } = makeApi();
  const { vault, handle } = vaultWithHandle();

  assert.equal(
    await completeEmailVerification(api, vault, handle),
    "completed",
  );
  assert.deepEqual(calls, [`inspect:${TOKEN}`, `complete:${TOKEN}`]);
  assert.equal(
    await completeEmailVerification(api, vault, handle),
    "invalid_link",
  );
});

test("verification does not complete when the server says inspection failed", async () => {
  const { api, calls } = makeApi({
    inspectEmailVerification: async ({ token }) => {
      calls.push(`inspect:${token}`);
      throw new Error("not available");
    },
  });
  const { vault, handle } = vaultWithHandle();

  assert.equal(await completeEmailVerification(api, vault, handle), "failed");
  assert.deepEqual(calls, [`inspect:${TOKEN}`]);
});

test("verification refuses an expired handle without calling the API", async () => {
  const { api, calls } = makeApi();
  const expired = vaultWithHandle(Date.now() - 5 * 60 * 1_000 - 1);
  assert.equal(
    await completeEmailVerification(
      api,
      expired.vault,
      expired.handle,
      undefined,
    ),
    "invalid_link",
  );
  assert.deepEqual(calls, []);
});
