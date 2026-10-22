/**
 * B184. Ephemeral UI pacing, NOT backend anti-abuse or authorization.
 * The server is still responsible for abuse prevention, token issuance and
 * rate limiting. No storage, cookies, timers or network calls in this module.
 */
export const VERIFICATION_RESEND_WAIT_MS = 60_000;

export function verificationEmailKey(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 320 ||
      /[\s\u0000-\u001f\u007f-\u009f]/u.test(trimmed)) {
    return null;
  }
  if (!/^[^@\s]+@[^@\s]+$/u.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function validNow(nowMs) {
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs) || nowMs < 0) {
    throw new TypeError("Invalid monotonic clock timestamp");
  }
  return nowMs;
}

/** A successful API acceptance starts a per-email, per-tab wait. */
export function acceptVerificationResend(email, nowMs) {
  const key = verificationEmailKey(email);
  validNow(nowMs);
  if (key === null || !Number.isFinite(nowMs + VERIFICATION_RESEND_WAIT_MS)) {
    throw new TypeError("Invalid accepted verification request");
  }
  return Object.freeze({
    key,
    untilMs: nowMs + VERIFICATION_RESEND_WAIT_MS,
  });
}

/** No cooldown for a different email, rejected request or a new page. */
export function verificationResendWaitSeconds(cooldown, email, nowMs) {
  validNow(nowMs);
  if (cooldown === null) return 0;
  if (!cooldown || typeof cooldown !== "object" ||
      typeof cooldown.key !== "string" ||
      !Number.isFinite(cooldown.untilMs)) {
    throw new TypeError("Invalid verification cooldown");
  }
  const key = verificationEmailKey(email);
  if (key === null || key !== cooldown.key) return 0;
  return Math.max(0, Math.ceil((cooldown.untilMs - nowMs) / 1000));
}

export function canRequestVerificationAgain(cooldown, email, nowMs, inFlight) {
  if (typeof inFlight !== "boolean") {
    throw new TypeError("Invalid request status");
  }
  return !inFlight && verificationEmailKey(email) !== null &&
    verificationResendWaitSeconds(cooldown, email, nowMs) === 0;
}
