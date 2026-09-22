export const AUTH_ACTION_TOKEN_STORE = Symbol('AUTH_ACTION_TOKEN_STORE');

export type AuthActionPurpose =
  | 'email_verification'
  | 'password_recovery';

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
};

export type CreateAuthActionTokenRecord = Omit<
  AuthActionTokenRecord,
  'consumedAt'
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
  findLatestActiveForUserPurpose(
    userId: string,
    purpose: AuthActionPurpose,
    now: Date,
  ): Promise<AuthActionTokenRecord | null>;
  listActiveForUserPurpose(
    userId: string,
    purpose: AuthActionPurpose,
    now: Date,
  ): Promise<AuthActionTokenRecord[]>;
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
