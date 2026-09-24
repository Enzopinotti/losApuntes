import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

import {
  ABUSE_CONTROL_STORE,
  type AbuseControlStore,
} from './abuse-control.store';
import type {
  AbuseControlAction,
  AbuseControlPolicy,
} from './abuse-control.types';
import { RateLimitedException } from './rate-limited.exception';

const MINUTE_MS = 60_000;

const POLICIES: Readonly<
  Record<AbuseControlAction, readonly AbuseControlPolicy[]>
> = Object.freeze({
  'auth.login': [
    { dimension: 'ip-target', limit: 5, windowMs: 5 * MINUTE_MS },
    { dimension: 'ip', limit: 120, windowMs: 5 * MINUTE_MS },
  ],
  'auth.register': [
    { dimension: 'ip-target', limit: 3, windowMs: 60 * MINUTE_MS },
    { dimension: 'ip', limit: 120, windowMs: 60 * MINUTE_MS },
  ],
  'auth.email_verification.request': [
    { dimension: 'ip-target', limit: 5, windowMs: 60 * MINUTE_MS },
    { dimension: 'ip', limit: 120, windowMs: 60 * MINUTE_MS },
  ],
  'auth.email_verification.inspect': [
    { dimension: 'ip', limit: 60, windowMs: 5 * MINUTE_MS },
  ],
  'auth.email_verification.complete': [
    { dimension: 'ip', limit: 20, windowMs: 15 * MINUTE_MS },
  ],
  'auth.password_recovery.request': [
    { dimension: 'ip-target', limit: 5, windowMs: 60 * MINUTE_MS },
    { dimension: 'ip', limit: 120, windowMs: 60 * MINUTE_MS },
  ],
  'auth.password_recovery.inspect': [
    { dimension: 'ip', limit: 60, windowMs: 5 * MINUTE_MS },
  ],
  'auth.password_recovery.complete': [
    { dimension: 'ip', limit: 20, windowMs: 15 * MINUTE_MS },
  ],
  'auth.password.change': [
    { dimension: 'ip-target', limit: 10, windowMs: 15 * MINUTE_MS },
  ],
});

function normalizedTarget(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

@Injectable()
export class AbuseControlService {
  private readonly logger = new Logger(AbuseControlService.name);
  private readonly secret: string;

  constructor(
    @Inject(ABUSE_CONTROL_STORE)
    private readonly store: AbuseControlStore,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('ABUSE_CONTROL_HMAC_SECRET');
  }

  async enforce(
    action: AbuseControlAction,
    clientIp: string,
    target?: string,
    now = new Date(),
  ): Promise<void> {
    const ip = clientIp.trim();
    if (!ip) {
      throw new ServiceUnavailableException({
        code: 'ABUSE_CONTROL_UNAVAILABLE',
        message: 'Authentication service is temporarily unavailable',
      });
    }

    for (const policy of POLICIES[action]) {
      const identity =
        policy.dimension === 'ip'
          ? ip
          : target
            ? `${ip}\0${normalizedTarget(target)}`
            : null;

      if (!identity) {
        throw new Error(
          `Abuse-control policy ${action}/${policy.dimension} requires a target`,
        );
      }

      const decision = await this.consume(action, policy, identity, now);
      if (!decision.allowed) {
        this.logger.warn({
          event: 'abuse_control.rate_limited',
          scope: action,
          dimension: policy.dimension,
          retryAfterSeconds: decision.retryAfterSeconds,
        });

        throw new RateLimitedException(decision.retryAfterSeconds);
      }
    }
  }

  private async consume(
    action: AbuseControlAction,
    policy: AbuseControlPolicy,
    identity: string,
    now: Date,
  ) {
    const nowMs = now.getTime();
    const startedMs = Math.floor(nowMs / policy.windowMs) * policy.windowMs;
    const expiresMs = startedMs + policy.windowMs;
    const identityHash = createHmac('sha256', this.secret)
      .update(action)
      .update('\0')
      .update(policy.dimension)
      .update('\0')
      .update(identity)
      .digest('hex');
    const key = createHmac('sha256', this.secret)
      .update(String(startedMs))
      .update('\0')
      .update(identityHash)
      .digest('hex');

    try {
      const row = await this.store.consume({
        key,
        scope: `${action}:${policy.dimension}`,
        windowStartedAt: new Date(startedMs),
        expiresAt: new Date(expiresMs),
      });

      return {
        allowed: row.count <= policy.limit,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((expiresMs - nowMs) / 1000),
        ),
      };
    } catch (error) {
      if (error instanceof RateLimitedException) throw error;

      this.logger.error({
        event: 'abuse_control.store_failed',
        scope: action,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });

      throw new ServiceUnavailableException({
        code: 'ABUSE_CONTROL_UNAVAILABLE',
        message: 'Authentication service is temporarily unavailable',
      });
    }
  }
}
