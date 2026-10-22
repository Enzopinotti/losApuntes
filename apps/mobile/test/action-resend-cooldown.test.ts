import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_ACTION_RESEND_COOLDOWN_MS,
  authActionResendAvailableAt,
  authActionResendSecondsRemaining,
} from "../src/features/auth/action-resend-cooldown";

test("auth action resend uses the shared one-minute cooldown", () => {
  assert.equal(AUTH_ACTION_RESEND_COOLDOWN_MS, 60_000);
  assert.equal(authActionResendAvailableAt(10_000), 70_000);
});

test("remaining resend time rounds up and never goes below zero", () => {
  assert.equal(authActionResendSecondsRemaining(null, 0), 0);
  assert.equal(authActionResendSecondsRemaining(60_000, 0), 60);
  assert.equal(authActionResendSecondsRemaining(60_001, 1_000), 60);
  assert.equal(authActionResendSecondsRemaining(60_000, 60_000), 0);
  assert.equal(authActionResendSecondsRemaining(59_000, 60_000), 0);
});
