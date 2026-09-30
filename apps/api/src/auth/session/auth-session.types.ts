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

export type ActiveAuthSessionInventoryQuery = {
  userId: string;
  credentialVersion: number;
  now: Date;
  webIdleAfter: Date;
  mobileIdleAfter: Date;
  limit: number;
};

export type ActiveAuthSessionInventoryPage = {
  items: AuthSessionRecord[];
  hasMore: boolean;
};

export interface AuthSessionStore {
  create(input: CreateAuthSessionRecord): Promise<AuthSessionRecord>;
  findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthSessionRecord | null>;
  listActiveForUser(
    input: ActiveAuthSessionInventoryQuery,
  ): Promise<ActiveAuthSessionInventoryPage>;
  findActiveOwnedById(
    userId: string,
    sessionId: string,
    credentialVersion: number,
    now: Date,
  ): Promise<AuthSessionRecord | null>;
  touchLastSeen(sessionId: string, lastSeenAt: Date): Promise<void>;
  revokeByTokenHash(tokenHash: string): Promise<void>;
  revokeOwnedById(userId: string, sessionId: string): Promise<boolean>;
  revokeAllForUser(userId: string): Promise<void>;
}
