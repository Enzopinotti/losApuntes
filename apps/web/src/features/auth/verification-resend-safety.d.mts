export type VerificationResendCooldown = Readonly<{
  key: string;
  untilMs: number;
}>;
export const VERIFICATION_RESEND_WAIT_MS: 60000;
export function verificationEmailKey(value: unknown): string | null;
export function acceptVerificationResend(
  email: string,
  nowMs: number,
): VerificationResendCooldown;
export function verificationResendWaitSeconds(
  cooldown: VerificationResendCooldown | null,
  email: string,
  nowMs: number,
): number;
export function canRequestVerificationAgain(
  cooldown: VerificationResendCooldown | null,
  email: string,
  nowMs: number,
  inFlight: boolean,
): boolean;
