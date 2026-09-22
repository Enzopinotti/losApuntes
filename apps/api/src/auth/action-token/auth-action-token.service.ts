import { Inject, Injectable } from '@nestjs/common';

import {
  AUTH_ACTION_TOKEN_STORE,
  type AuthActionPurpose,
  type AuthActionTokenRecord,
  type AuthActionTokenStore,
} from './auth-action-token.types';
import {
  createActionToken,
  createActionTokenId,
  hashActionToken,
  isActionToken,
} from './action-token';

const ISSUE_COOLDOWN_MS = 60_000;
const MAX_ACTIVE_TOKENS_PER_PURPOSE = 3;
const PURPOSE_TTL_MS: Record<AuthActionPurpose, number> = {
  email_verification: 24 * 60 * 60 * 1000,
  password_recovery: 30 * 60 * 1000,
};

export type IssuedAuthActionToken = {
  token: string;
  expiresAt: Date;
};

@Injectable()
export class AuthActionTokenService {
  constructor(
    @Inject(AUTH_ACTION_TOKEN_STORE)
    private readonly store: AuthActionTokenStore,
  ) {}

  async issueIfAllowed(
    userId: string,
    purpose: AuthActionPurpose,
    credentialVersion: number | undefined,
    now = new Date(),
  ): Promise<IssuedAuthActionToken | null> {
    const latest = await this.store.findLatestActiveForUserPurpose(
      userId,
      purpose,
      now,
    );

    if (
      latest &&
      now.getTime() - latest.createdAt.getTime() < ISSUE_COOLDOWN_MS
    ) {
      return null;
    }

    const token = createActionToken();
    const expiresAt = new Date(now.getTime() + PURPOSE_TTL_MS[purpose]);
    const created = await this.store.createIfBucketAvailable({
      id: createActionTokenId(),
      userId,
      purpose,
      tokenHash: hashActionToken(token),
      credentialVersion,
      issueBucket: Math.floor(now.getTime() / ISSUE_COOLDOWN_MS),
      createdAt: now,
      expiresAt,
    });

    if (!created) return null;

    const active = await this.store.listActiveForUserPurpose(
      userId,
      purpose,
      now,
    );

    if (active.length > MAX_ACTIVE_TOKENS_PER_PURPOSE) {
      await this.store.invalidateByIds(
        userId,
        purpose,
        active
          .slice(MAX_ACTIVE_TOKENS_PER_PURPOSE)
          .map((record) => record.id),
        now,
      );
    }

    return {
      token,
      expiresAt,
    };
  }

  async inspect(
    token: string,
    purpose: AuthActionPurpose,
    now = new Date(),
  ): Promise<AuthActionTokenRecord | null> {
    if (!isActionToken(token)) return null;

    return this.store.findAvailableByTokenHash(
      hashActionToken(token),
      purpose,
      now,
    );
  }

  async invalidateToken(
    token: string,
    purpose: AuthActionPurpose,
    now = new Date(),
  ): Promise<void> {
    const record = await this.inspect(token, purpose, now);
    if (!record) return;

    await this.store.invalidateByIds(
      record.userId,
      purpose,
      [record.id],
      now,
    );
  }

  async invalidateAll(
    userId: string,
    purpose: AuthActionPurpose,
    now = new Date(),
  ): Promise<void> {
    await this.store.invalidateAllForUserPurpose(userId, purpose, now);
  }
}
