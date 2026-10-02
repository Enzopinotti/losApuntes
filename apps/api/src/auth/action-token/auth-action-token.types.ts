export const AUTH_ACTION_TOKEN_STORE = Symbol('AUTH_ACTION_TOKEN_STORE');

export type AuthActionPurpose = 'email_verification' | 'password_recovery';

export type AuthActionTokenConsumptionReason = 'claimed' | 'invalidated';

export type AuthActionTokenRecord = {
  id: string;
  userId: string;
  purpose: AuthActionPurpose;
  tokenHash: string;
  credentialVersion?: number;
  issueBucket: number;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedReason: AuthActionTokenConsumptionReason | null;
};

export type CreateAuthActionTokenRecord = Omit<
  AuthActionTokenRecord,
  'consumedAt' | 'consumedReason'
>;

export interface AuthActionTokenStore {
  createIfBucketAvailable(
    input: CreateAuthActionTokenRecord,
  ): Promise<AuthActionTokenRecord | null>;
  findAvailableByTokenHash(
    tokenHash: string,
    purpose: AuthActionPurpose,
    now: Date,
  ): Promise<AuthActionTokenRecord | null>;
  claimAvailableByTokenHash(
    tokenHash: string,
    purpose: AuthActionPurpose,
    consumedAt: Date,
  ): Promise<AuthActionTokenRecord | null>;
  findClaimedByTokenHash(
    tokenHash: string,
    purpose: AuthActionPurpose,
    now: Date,
  ): Promise<AuthActionTokenRecord | null>;
  findLatestActiveForUserPurpose(
    userId: string,
    purpose: AuthActionPurpose,
    now: Date,
  ): Promise<AuthActionTokenRecord | null>;
  trimActiveForUserPurpose(
    userId: string,
    purpose: AuthActionPurpose,
    now: Date,
    keep: number,
    consumedAt: Date,
  ): Promise<void>;
  invalidateByIds(
    userId: string,
    purpose: AuthActionPurpose,
    ids: string[],
    consumedAt: Date,
  ): Promise<void>;
  invalidateAllForUserPurpose(
    userId: string,
    purpose: AuthActionPurpose,
    consumedAt: Date,
  ): Promise<void>;
}
