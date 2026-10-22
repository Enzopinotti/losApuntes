export const PASSWORD_RECOVERY_RESEND_COOLDOWN_MS = 60_000;

export const passwordRecoveryResendAvailableAt = (
  requestedAtMs: number,
): number => requestedAtMs + PASSWORD_RECOVERY_RESEND_COOLDOWN_MS;

export const passwordRecoveryResendSecondsRemaining = (
  availableAtMs: number | null,
  nowMs: number,
): number => {
  if (availableAtMs === null || !Number.isFinite(availableAtMs)) return 0;
  if (!Number.isFinite(nowMs)) return 0;

  return Math.max(0, Math.ceil((availableAtMs - nowMs) / 1000));
};
