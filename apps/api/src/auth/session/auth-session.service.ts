import { Inject, Injectable } from '@nestjs/common';

import {
  AUTH_SESSION_STORE,
  type AuthClientType,
  type AuthSessionRecord,
  type AuthSessionStore,
  type PublicAuthSession,
} from './auth-session.types';
import {
  createSessionToken,
  hashSessionToken,
  isSessionToken,
} from './session-token';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LAST_SEEN_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type IssuedAuthSession = {
  sessionToken: string;
  session: PublicAuthSession;
};

export type ResolvedAuthSession = {
  userId: string;
  session: PublicAuthSession;
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

@Injectable()
export class AuthSessionService {
  constructor(
    @Inject(AUTH_SESSION_STORE)
    private readonly store: AuthSessionStore,
  ) {}

  async issue(
    userId: string,
    clientType: AuthClientType,
    now = new Date(),
  ): Promise<IssuedAuthSession> {
    const sessionToken = createSessionToken();
    const record = await this.store.create({
      userId,
      tokenHash: hashSessionToken(sessionToken),
      clientType,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
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

    const record = await this.store.findActiveByTokenHash(
      hashSessionToken(sessionToken),
      now,
    );

    if (!record || record.clientType !== expectedClientType) {
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
    now = new Date(),
  ): Promise<PublicAuthSession[]> {
    const sessions = await this.store.listActiveForUser(userId, now);

    return sessions.map((session) =>
      toPublicSession(session, session.id === currentSessionId),
    );
  }

  async revokeOwned(userId: string, sessionId: string): Promise<boolean> {
    return this.store.revokeOwnedById(userId, sessionId);
  }

  async revokeAll(userId: string): Promise<void> {
    await this.store.revokeAllForUser(userId);
  }
}
