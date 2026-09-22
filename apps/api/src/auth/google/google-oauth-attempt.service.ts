import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  GOOGLE_OAUTH_ATTEMPT_STORE,
  type GoogleOAuthAttemptRecord,
  type GoogleOAuthAttemptStore,
  type GoogleOAuthIntent,
} from './google.types';

const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000;
const OAUTH_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

function randomBearer(): string {
  return randomBytes(32).toString('base64url');
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function codeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
}

function safeReturnPath(value: string | undefined): string {
  if (
    !value ||
    value.length > 256 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return '/login';
  }

  try {
    const parsed = new URL(value, 'https://losapuntes.invalid');
    if (parsed.origin !== 'https://losapuntes.invalid') {
      return '/login';
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/login';
  }
}

export type IssuedGoogleOAuthAttempt = {
  state: string;
  nonce: string;
  codeChallenge: string;
  returnPath: string;
};

@Injectable()
export class GoogleOAuthAttemptService {
  constructor(
    @Inject(GOOGLE_OAUTH_ATTEMPT_STORE)
    private readonly store: GoogleOAuthAttemptStore,
  ) {}

  async issue(
    intent: GoogleOAuthIntent,
    userId: string | undefined,
    requestedReturnPath: string | undefined,
    now = new Date(),
  ): Promise<IssuedGoogleOAuthAttempt> {
    const state = randomBearer();
    const nonce = randomBearer();
    const codeVerifier = randomBearer();
    const returnPath = safeReturnPath(requestedReturnPath);

    await this.store.create({
      id: randomUUID(),
      stateHash: hash(state),
      nonceHash: hash(nonce),
      codeVerifier,
      intent,
      userId,
      returnPath,
      createdAt: now,
      expiresAt: new Date(now.getTime() + OAUTH_ATTEMPT_TTL_MS),
    });

    return {
      state,
      nonce,
      codeChallenge: codeChallenge(codeVerifier),
      returnPath,
    };
  }

  async consume(
    state: string,
    now = new Date(),
  ): Promise<GoogleOAuthAttemptRecord | null> {
    if (!OAUTH_SECRET_PATTERN.test(state)) {
      return null;
    }

    return this.store.consumeByStateHash(hash(state), now);
  }

  nonceMatches(record: GoogleOAuthAttemptRecord, nonce: string): boolean {
    return OAUTH_SECRET_PATTERN.test(nonce) && hash(nonce) === record.nonceHash;
  }
}
