export const AUTH_ACTION_RESEND_COOLDOWN_MS = 60_000;

export const authActionResendAvailableAt = (requestedAtMs: number): number =>
  requestedAtMs + AUTH_ACTION_RESEND_COOLDOWN_MS;

export const authActionResendSecondsRemaining = (
  availableAtMs: number | null,
  nowMs: number,
): number => {
  if (availableAtMs === null || !Number.isFinite(availableAtMs)) return 0;
  if (!Number.isFinite(nowMs)) return 0;

  return Math.max(0, Math.ceil((availableAtMs - nowMs) / 1000));
};
