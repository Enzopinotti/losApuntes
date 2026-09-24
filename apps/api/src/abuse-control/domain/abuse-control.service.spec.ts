import {
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AbuseControlStore } from './abuse-control.store';
import { AbuseControlService } from './abuse-control.service';
import type { AbuseRateWindowRecord } from './abuse-control.types';

const NOW = new Date('2026-09-24T18:00:00.000Z');
const SECRET = 'unit-test-abuse-control-hmac-secret-value';

class MemoryAbuseControlStore implements AbuseControlStore {
  readonly inputs: Array<{
    key: string;
    scope: string;
    windowStartedAt: Date;
    expiresAt: Date;
  }> = [];

  private readonly counts = new Map<string, number>();

  async consume(input: {
    key: string;
    scope: string;
    windowStartedAt: Date;
    expiresAt: Date;
  }): Promise<AbuseRateWindowRecord> {
    this.inputs.push(input);
    const count = (this.counts.get(input.key) ?? 0) + 1;
    this.counts.set(input.key, count);

    return {
      ...input,
      count,
    };
  }
}

function service(store: AbuseControlStore): AbuseControlService {
  return new AbuseControlService(
    store,
    new ConfigService({
      ABUSE_CONTROL_HMAC_SECRET: SECRET,
    }),
  );
}

async function rejectedHttpException(
  operation: Promise<unknown>,
): Promise<HttpException> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof HttpException) return error;
    throw error;
  }

  throw new Error('Expected operation to reject');
}

describe('AbuseControlService', () => {
  it('rate-limits login by IP + email after five attempts', async () => {
    const store = new MemoryAbuseControlStore();
    const controls = service(store);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        controls.enforce(
          'auth.login',
          '198.51.100.10',
          'Student@Example.com',
          NOW,
        ),
      ).resolves.toBeUndefined();
    }

    const error = await rejectedHttpException(
      controls.enforce(
        'auth.login',
        '198.51.100.10',
        'student@example.com',
        NOW,
      ),
    );

    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many attempts',
      retryAfterSeconds: 300,
    });
  });

  it('does not let one source IP consume another source IP target allowance', async () => {
    const store = new MemoryAbuseControlStore();
    const controls = service(store);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await controls.enforce(
        'auth.login',
        '198.51.100.20',
        'victim@example.com',
        NOW,
      );
    }

    await expect(
      controls.enforce(
        'auth.login',
        '203.0.113.21',
        'victim@example.com',
        NOW,
      ),
    ).resolves.toBeUndefined();
  });

  it('never persists raw IP or email in limiter window inputs', async () => {
    const store = new MemoryAbuseControlStore();
    const controls = service(store);

    await controls.enforce(
      'auth.login',
      '198.51.100.30',
      'private@example.com',
      NOW,
    );

    const serialized = JSON.stringify(store.inputs);
    expect(serialized).not.toContain('198.51.100.30');
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).toContain('auth.login:ip-target');
    expect(serialized).toContain('auth.login:ip');
  });

  it('starts a fresh allowance in the next fixed window', async () => {
    const store = new MemoryAbuseControlStore();
    const controls = service(store);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await controls.enforce(
        'auth.login',
        '198.51.100.40',
        'student@example.com',
        NOW,
      );
    }

    await expect(
      controls.enforce(
        'auth.login',
        '198.51.100.40',
        'student@example.com',
        new Date(NOW.getTime() + 5 * 60_000),
      ),
    ).resolves.toBeUndefined();
  });

  it('does not silently allow when the shared limiter store fails', async () => {
    const controls = service({
      consume: jest.fn().mockRejectedValue(new Error('mongo unavailable')),
    });

    const error = await rejectedHttpException(
      controls.enforce(
        'auth.login',
        '198.51.100.50',
        'student@example.com',
        NOW,
      ),
    );

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toEqual({
      code: 'ABUSE_CONTROL_UNAVAILABLE',
      message: 'Authentication service is temporarily unavailable',
    });
  });

  it('requires a target for a target-scoped policy', async () => {
    const controls = service(new MemoryAbuseControlStore());

    await expect(
      controls.enforce('auth.login', '198.51.100.60', undefined, NOW),
    ).rejects.toThrow('requires a target');
  });
});
