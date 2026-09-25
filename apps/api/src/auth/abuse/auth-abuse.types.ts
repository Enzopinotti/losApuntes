export const AUTH_ABUSE_OPERATIONS = [
  'password_login',
  'registration',
  'verification_request',
  'recovery_request',
] as const;

export type AuthAbuseOperation = (typeof AUTH_ABUSE_OPERATIONS)[number];

export const AUTH_ABUSE_DIMENSIONS = ['origin', 'origin_identifier'] as const;

export type AuthAbuseDimension = (typeof AUTH_ABUSE_DIMENSIONS)[number];

export interface AuthAbuseBucketRecord {
  bucketKey: string;
  operation: AuthAbuseOperation;
  dimension: AuthAbuseDimension;
  windowStartedAt: Date;
  windowEndsAt: Date;
  count: number;
  expiresAt: Date;
}

export interface AuthAbusePolicy {
  operation: AuthAbuseOperation;
  windowMs: number;
  originLimit: number;
  pairLimit: number;
}
