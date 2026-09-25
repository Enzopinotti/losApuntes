import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

import { requireConfigString } from '../../config/required-config';
import {
  AuthAbuseControlUnavailableError,
  AuthRateLimitedError,
} from './auth-abuse.errors';
import { AUTH_ABUSE_STORE, type AuthAbuseStore } from './auth-abuse.store';
import type {
  AuthAbuseDimension,
  AuthAbuseOperation,
  AuthAbusePolicy,
} from './auth-abuse.types';

const BUCKET_RETENTION_MS = 5 * 60 * 1000;

const POLICIES: Readonly<Record<AuthAbuseOperation, AuthAbusePolicy>> = {
  password_login: {
    operation: 'password_login',
    windowMs: 10 * 60 * 1000,
    originLimit: 120,
    pairLimit: 10,
  },
  registration: {
    operation: 'registration',
    windowMs: 60 * 60 * 1000,
    originLimit: 30,
    pairLimit: 5,
  },
  verification_request: {
    operation: 'verification_request',
    windowMs: 60 * 60 * 1000,
    originLimit: 40,
    pairLimit: 6,
  },
  recovery_request: {
    operation: 'recovery_request',
    windowMs: 60 * 60 * 1000,
    originLimit: 40,
    pairLimit: 6,
  },
};

function normalizeOrigin(value: string): string {
  const trimmed = value.trim();
  const mappedV4 = trimmed.toLowerCase().startsWith('::ffff:')
    ? trimmed.slice(7)
    : null;

  if (mappedV4 && isIP(mappedV4) === 4) return mappedV4;

  return trimmed.toLowerCase();
}

function normalizeIdentifier(value: string): string {
  return value.normalize('NFC').trim().toLowerCase();
}

function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function retryAfterSeconds(now: Date, windowEndsAt: Date): number {
  return Math.max(
    1,
    Math.ceil((windowEndsAt.getTime() - now.getTime()) / 1000),
  );
}

@Injectable()
export class AuthAbuseService {
  private readonly logger = new Logger(AuthAbuseService.name);
  private readonly keySecret: string;

  constructor(
    @Inject(AUTH_ABUSE_STORE)
    private readonly store: AuthAbuseStore,
    config: ConfigService,
  ) {
    this.keySecret = requireConfigString(config, 'AUTH_ABUSE_KEY_SECRET');
  }

  async admit(
    operation: Exclude<AuthAbuseOperation, 'password_login'>,
    origin: string,
    identifier: string,
    now = new Date(),
  ): Promise<void> {
    const policy = POLICIES[operation];

    await this.consumeOrReject(
      policy,
      'origin_identifier',
      `${normalizeOrigin(origin)}\0${normalizeIdentifier(identifier)}`,
      policy.pairLimit,
      now,
    );

    await this.consumeOrReject(
      policy,
      'origin',
      normalizeOrigin(origin),
      policy.originLimit,
      now,
    );
  }

  async admitLoginOrigin(origin: string, now = new Date()): Promise<void> {
    const policy = POLICIES.password_login;

    await this.consumeOrReject(
      policy,
      'origin',
      normalizeOrigin(origin),
      policy.originLimit,
      now,
    );
  }

  async recordInvalidLogin(
    origin: string,
    identifier: string,
    now = new Date(),
  ): Promise<void> {
    const policy = POLICIES.password_login;

    await this.consumeOrReject(
      policy,
      'origin_identifier',
      `${normalizeOrigin(origin)}\0${normalizeIdentifier(identifier)}`,
      policy.pairLimit,
      now,
    );
  }

  private async consumeOrReject(
    policy: AuthAbusePolicy,
    dimension: AuthAbuseDimension,
    signal: string,
    limit: number,
    now: Date,
  ): Promise<void> {
    const startedAt = windowStart(now, policy.windowMs);
    const windowEndsAt = new Date(startedAt.getTime() + policy.windowMs);
    const bucketKey = createHmac('sha256', this.keySecret)
      .update(
        `${policy.operation}\0${dimension}\0${startedAt.getTime()}\0${signal}`,
      )
      .digest('hex');

    try {
      const bucket = await this.store.consume({
        bucketKey,
        operation: policy.operation,
        dimension,
        windowStartedAt: startedAt,
        windowEndsAt,
        expiresAt: new Date(windowEndsAt.getTime() + BUCKET_RETENTION_MS),
      });

      if (bucket.count > limit) {
        this.logger.warn({
          event: 'auth.abuse.rate_limited',
          operation: policy.operation,
          dimension,
        });

        throw new AuthRateLimitedError(retryAfterSeconds(now, windowEndsAt));
      }
    } catch (error) {
      if (error instanceof AuthRateLimitedError) throw error;

      this.logger.error({
        event: 'auth.abuse.control_unavailable',
        operation: policy.operation,
        dimension,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });

      throw new AuthAbuseControlUnavailableError();
    }
  }
}

export const AUTH_ABUSE_POLICIES = POLICIES;
