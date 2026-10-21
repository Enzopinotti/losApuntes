import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  VERIFICATION_RESEND_WAIT_MS,
  verificationEmailKey,
  acceptVerificationResend,
  verificationResendWaitSeconds,
  canRequestVerificationAgain,
} from "../apps/web/src/features/auth/verification-resend-safety.mjs";

test("B184 accepted resend starts exactly one minute for the same email", () => {
  const wait = acceptVerificationResend(" Student@Example.EDU  ", 1000);
  assert.deepEqual(wait, { key: "student@example.edu", untilMs: 61000 });
  assert.equal(verificationResendWaitSeconds(wait, "student@example.edu", 1000), 60);
  assert.equal(verificationResendWaitSeconds(wait, "student@example.edu", 1199), 60);
  assert.equal(verificationResendWaitSeconds(wait, "student@example.edu", 60001), 1);
  assert.equal(verificationResendWaitSeconds(wait, "student@example.edu", 61000), 0);
  assert.equal(VERIFICATION_RESEND_WAIT_MS, 60000);
});

test("B184 a corrected address is not throttled by the previous address", () => {
  const wait = acceptVerificationResend("first@example.edu", 0);
  assert.equal(verificationResendWaitSeconds(wait, "second@example.edu", 1), 0);
  assert.equal(canRequestVerificationAgain(wait, "second@example.edu", 1, false), true);
  assert.equal(canRequestVerificationAgain(wait, "first@example.edu", 1, false), false);
});

test("B184 fast duplicate submissions are blocked by synchronous in-flight state", () => {
  assert.equal(canRequestVerificationAgain(null, "student@example.edu", 100, false), true);
  assert.equal(canRequestVerificationAgain(null, "student@example.edu", 100, true), false);
  assert.equal(canRequestVerificationAgain(null, "other@example.edu", 100, true), false);
  assert.throws(() => canRequestVerificationAgain(null, "a@b", 100, "false"));
});

test("B184 errors do not start local cooldown; only accepted API requests do", () => {
  assert.equal(canRequestVerificationAgain(null, "student@example.edu", 5000, false), true);
  assert.equal(verificationResendWaitSeconds(null, "student@example.edu", 5000), 0);
});

test("B184 normalizes email keys but rejects malformed route-state data", () => {
  assert.equal(verificationEmailKey(" User@Example.EDU "), "user@example.edu");
  for (const bad of [null, 1, {}, "", "bad", "a@b c", "@domain.edu",
    "person@@domain.edu", "test@domain.edu\nx", "z".repeat(315)+"@email.edu"]) {
    assert.equal(verificationEmailKey(bad), null);
  }
});

test("B184 monotonic time is bounded and cannot be NaN or backwards", () => {
  const wait = acceptVerificationResend("student@example.edu", 900);
  for (const now of [-1, Number.NaN, Number.POSITIVE_INFINITY, "900", null]) {
    assert.throws(() => acceptVerificationResend("student@example.edu", now));
    assert.throws(() => verificationResendWaitSeconds(wait, "student@example.edu", now));
  }
  assert.equal(verificationResendWaitSeconds(wait, "student@example.edu", 901), 60);
});

test("B184 malformed cooldown records fail closed", () => {
  for (const fake of [undefined, {}, { key: "student@example.edu" },
    { key: "student@example.edu", untilMs: NaN },
    { key: 1, untilMs: 9000 }]) {
    assert.throws(() => verificationResendWaitSeconds(fake, "student@example.edu", 2000));
  }
});

test("B184 does not auto-send on mount or while the tab is hidden", async () => {
  const page = await readFile("apps/web/src/pages/VerificationPending.tsx", "utf8");
  assert.match(page, /onSubmit=\{\(event\) => void resend\(event\)\}/u);
  assert.match(page, /inFlight\.current = true/u);
  assert.match(page, /inFlight\.current = false/u);
  assert.match(page, /if \(!mounted\.current\) return/u);
  assert.match(page, /window\.clearInterval\(timer\)/u);
  assert.match(page, /visibilitychange/u);
  assert.match(page, /performance\.now\(\)/u);
  assert.doesNotMatch(page, /localStorage|sessionStorage|sendBeacon|Notification|setTimeout\(/u);
});

test("B184 UI preserves generic anti-enumeration feedback and server errors", async () => {
  const page = await readFile("apps/web/src/pages/VerificationPending.tsx", "utf8");
  assert.match(page, /Si podemos continuar con esa dirección/u);
  assert.match(page, /authErrorMessage\(/u);
  assert.match(page, /authErrorRequestId\(/u);
  assert.match(page, /waitSeconds > 0/u);
  assert.match(page, /disabled=\{sending\}/u);
  assert.match(page, /límites de seguridad y los reintentos válidos los controla el servidor/u);
});

test("B184 only calls the preexisting verification endpoint, never changes credentials", async () => {
  const page = await readFile("apps/web/src/pages/VerificationPending.tsx", "utf8");
  assert.equal((page.match(/authApi\.requestEmailVerification\(/gu) || []).length, 1);
  assert.doesNotMatch(page, /authApi\.(login|register|logout|changePassword|completeEmailVerification)\(/u);
  const service = await readFile("apps/web/src/features/auth/services/authService.ts", "utf8");
  assert.match(service, /requestEmailVerification: \(email: string\)/u);
  assert.match(service, /"\/auth\/email-verification\/request"/u);
});
