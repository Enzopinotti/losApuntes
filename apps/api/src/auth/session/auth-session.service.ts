import { Inject, Injectable } from '@nestjs/common';

import {
  AUTH_SESSION_STORE,
  type AuthClientType,
  type AuthSessionRecord,
  type AuthSessionStore,
  type PublicAuthSession,
} from './auth-session.types';
import {
  createSessionId,
  createSessionToken,
  hashSessionToken,
  isSessionId,
  isSessionToken,
} from './session-token';

const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_IDLE_TTL_MS: Record<AuthClientType, number> = {
  web: 24 * 60 * 60 * 1000,
  mobile: 14 * 24 * 60 * 60 * 1000,
};
const LAST_SEEN_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
export const AUTH_SESSION_INVENTORY_LIMIT = 20;

export type IssuedAuthSession = {
  sessionToken: string;
  session: PublicAuthSession;
};

export type ResolvedAuthSession = {
  userId: string;
  credentialVersion: number;
  session: PublicAuthSession;
};

export type ActiveAuthSessionInventory = {
  sessions: PublicAuthSession[];
  truncated: boolean;
  limit: number;
};

function toPublicSession(
  record: AuthSessionRecord,
  current: boolean,
): PublicAuthSession {
  return {
    id: record.id,
    clientType: record.clientType,
    createdAt: record.createdAt.toISOString(),
    lastSeenAt: record.lastSeenAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    current,
  };
}

function isIdleExpired(record: AuthSessionRecord, now: Date): boolean {
  return (
    now.getTime() - record.lastSeenAt.getTime() >=
    SESSION_IDLE_TTL_MS[record.clientType]
  );
}

@Injectable()
export class AuthSessionService {
  constructor(
    @Inject(AUTH_SESSION_STORE)
    private readonly store: AuthSessionStore,
  ) {}

  async issue(
    userId: string,
    clientType: AuthClientType,
    credentialVersion: number,
    now = new Date(),
  ): Promise<IssuedAuthSession> {
    const sessionToken = createSessionToken();
    const record = await this.store.create({
      id: createSessionId(),
      userId,
      tokenHash: hashSessionToken(sessionToken),
      credentialVersion,
      clientType,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS),
    });

    return {
      sessionToken,
      session: toPublicSession(record, true),
    };
  }

  async resolve(
    sessionToken: string,
    expectedClientType: AuthClientType,
    now = new Date(),
  ): Promise<ResolvedAuthSession | null> {
    if (!isSessionToken(sessionToken)) {
      return null;
    }

    const tokenHash = hashSessionToken(sessionToken);
    const record = await this.store.findActiveByTokenHash(tokenHash, now);

    if (!record || record.clientType !== expectedClientType) {
      return null;
    }

    if (isIdleExpired(record, now)) {
      await this.store.revokeByTokenHash(tokenHash);
      return null;
    }

    if (
      now.getTime() - record.lastSeenAt.getTime() >=
      LAST_SEEN_TOUCH_INTERVAL_MS
    ) {
      await this.store.touchLastSeen(record.id, now);
      record.lastSeenAt = now;
    }

    return {
      userId: record.userId,
      credentialVersion: record.credentialVersion,
      session: toPublicSession(record, true),
    };
  }

  async revokeCurrent(sessionToken: string): Promise<void> {
    if (!isSessionToken(sessionToken)) {
      return;
    }

    await this.store.revokeByTokenHash(hashSessionToken(sessionToken));
  }

  async listForUser(
    userId: string,
    currentSessionId: string,
    credentialVersion: number,
    now = new Date(),
  ): Promise<ActiveAuthSessionInventory> {
    const page = await this.store.listActiveForUser({
      userId,
      credentialVersion,
      now,
      webIdleAfter: new Date(now.getTime() - SESSION_IDLE_TTL_MS.web),
      mobileIdleAfter: new Date(now.getTime() - SESSION_IDLE_TTL_MS.mobile),
      limit: AUTH_SESSION_INVENTORY_LIMIT,
    });

    let sessions = page.items;
    let truncated = page.hasMore;

    if (!sessions.some((session) => session.id === currentSessionId)) {
      const current = await this.store.findActiveOwnedById(
        userId,
        currentSessionId,
        credentialVersion,
        now,
      );

      if (current && !isIdleExpired(current, now)) {
        if (sessions.length >= AUTH_SESSION_INVENTORY_LIMIT) {
          sessions = [
            ...sessions.slice(0, AUTH_SESSION_INVENTORY_LIMIT - 1),
            current,
          ];
          truncated = true;
        } else {
          sessions = [...sessions, current];
        }
      }
    }

    return {
      sessions: sessions.map((session) =>
        toPublicSession(session, session.id === currentSessionId),
      ),
      truncated,
      limit: AUTH_SESSION_INVENTORY_LIMIT,
    };
  }

  async revokeOwned(userId: string, sessionId: string): Promise<boolean> {
    if (!isSessionId(sessionId)) {
      return false;
    }

    return this.store.revokeOwnedById(userId, sessionId);
  }

  async revokeAll(userId: string): Promise<void> {
    await this.store.revokeAllForUser(userId);
  }
}
