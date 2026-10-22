import assert from "node:assert/strict";
import test from "node:test";

import {
  PASSWORD_RECOVERY_RESEND_COOLDOWN_MS,
  passwordRecoveryResendAvailableAt,
  passwordRecoveryResendSecondsRemaining,
} from "../src/features/auth/password-recovery-resend";

test("password recovery resend uses the shared one-minute cooldown", () => {
  assert.equal(PASSWORD_RECOVERY_RESEND_COOLDOWN_MS, 60_000);
  assert.equal(passwordRecoveryResendAvailableAt(10_000), 70_000);
});

test("remaining resend time rounds up and never goes below zero", () => {
  assert.equal(passwordRecoveryResendSecondsRemaining(null, 0), 0);
  assert.equal(passwordRecoveryResendSecondsRemaining(60_000, 0), 60);
  assert.equal(passwordRecoveryResendSecondsRemaining(60_001, 1_000), 60);
  assert.equal(passwordRecoveryResendSecondsRemaining(60_000, 60_000), 0);
  assert.equal(passwordRecoveryResendSecondsRemaining(59_000, 60_000), 0);
});
