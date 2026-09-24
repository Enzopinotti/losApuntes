import type {
  AuthAbuseBucketRecord,
  AuthAbuseDimension,
  AuthAbuseOperation,
} from './auth-abuse.types';

export const AUTH_ABUSE_STORE = Symbol('AUTH_ABUSE_STORE');

export interface AuthAbuseStore {
  consume(input: {
    bucketKey: string;
    operation: AuthAbuseOperation;
    dimension: AuthAbuseDimension;
    windowStartedAt: Date;
    windowEndsAt: Date;
    expiresAt: Date;
  }): Promise<AuthAbuseBucketRecord>;
}
