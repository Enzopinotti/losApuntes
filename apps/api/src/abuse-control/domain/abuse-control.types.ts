export const ABUSE_CONTROL_ACTIONS = [
  'auth.login',
  'auth.register',
  'auth.email_verification.request',
  'auth.email_verification.inspect',
  'auth.email_verification.complete',
  'auth.password_recovery.request',
  'auth.password_recovery.inspect',
  'auth.password_recovery.complete',
  'auth.password.change',
] as const;

export type AbuseControlAction = (typeof ABUSE_CONTROL_ACTIONS)[number];

export type AbuseControlDimension = 'ip' | 'ip-target';

export interface AbuseControlPolicy {
  dimension: AbuseControlDimension;
  limit: number;
  windowMs: number;
}

export interface AbuseRateWindowRecord {
  key: string;
  scope: string;
  count: number;
  windowStartedAt: Date;
  expiresAt: Date;
}

export interface AbuseControlDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}
