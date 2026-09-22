export const AUTH_SESSION_STORE = Symbol('AUTH_SESSION_STORE');

export type AuthClientType = 'web' | 'mobile';

export type AuthSessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  credentialVersion: number;
  clientType: AuthClientType;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

export type CreateAuthSessionRecord = AuthSessionRecord;

export type PublicAuthSession = {
  id: string;
  clientType: AuthClientType;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
};

export interface AuthSessionStore {
  create(input: CreateAuthSessionRecord): Promise<AuthSessionRecord>;
  findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthSessionRecord | null>;
  listActiveForUser(userId: string, now: Date): Promise<AuthSessionRecord[]>;
  touchLastSeen(sessionId: string, lastSeenAt: Date): Promise<void>;
  revokeByTokenHash(tokenHash: string): Promise<void>;
  revokeOwnedById(userId: string, sessionId: string): Promise<boolean>;
  revokeAllForUser(userId: string): Promise<void>;
}
