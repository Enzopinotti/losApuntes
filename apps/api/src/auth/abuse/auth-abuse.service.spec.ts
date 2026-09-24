import { ConfigService } from '@nestjs/config';

import {
  AuthAbuseControlUnavailableError,
  AuthRateLimitedError,
} from './auth-abuse.errors';
import { AuthAbuseService } from './auth-abuse.service';
import type { AuthAbuseStore } from './auth-abuse.store';

const NOW = new Date('2026-09-24T12:05:00.000Z');
const KEY_SECRET = 'test-auth-abuse-key-secret-value-2026';

function store() {
  return {
    consume: jest.fn(),
  };
}

function service(abuseStore: ReturnType<typeof store>): AuthAbuseService {
  return new AuthAbuseService(
    abuseStore as unknown as AuthAbuseStore,
    new ConfigService({
      AUTH_ABUSE_KEY_SECRET: KEY_SECRET,
    }),
  );
}

describe('AuthAbuseService', () => {
  it('consumes the pair before the broad origin bucket', async () => {
    const abuseStore = store();
    abuseStore.consume.mockImplementation(async (input) => ({
      ...input,
      count: 1,
    }));
    const abuse = service(abuseStore);

    await abuse.admit(
      'registration',
      '203.0.113.10',
      'Enzo@Example.com',
      NOW,
    );

    expect(abuseStore.consume).toHaveBeenCalledTimes(2);
    expect(abuseStore.consume.mock.calls[0]?.[0]).toMatchObject({
      operation: 'registration',
      dimension: 'origin_identifier',
    });
    expect(abuseStore.consume.mock.calls[1]?.[0]).toMatchObject({
      operation: 'registration',
      dimension: 'origin',
    });
  });

  it('rejects an exhausted pair without draining the origin bucket', async () => {
    const abuseStore = store();
    abuseStore.consume.mockImplementation(async (input) => ({
      ...input,
      count: input.dimension === 'origin_identifier' ? 6 : 1,
    }));
    const abuse = service(abuseStore);

    await expect(
      abuse.admit(
        'registration',
        '203.0.113.10',
        'victim@example.com',
        NOW,
      ),
    ).rejects.toMatchObject({
      retryAfterSeconds: 3_300,
    } satisfies Partial<AuthRateLimitedError>);

    expect(abuseStore.consume).toHaveBeenCalledTimes(1);
    expect(abuseStore.consume.mock.calls[0]?.[0]).toMatchObject({
      dimension: 'origin_identifier',
    });
  });

  it('does not create a global account bucket across origins', async () => {
    const abuseStore = store();
    abuseStore.consume.mockImplementation(async (input) => ({
      ...input,
      count: 1,
    }));
    const abuse = service(abuseStore);

    await abuse.admit(
      'recovery_request',
      '203.0.113.10',
      'same@example.com',
      NOW,
    );
    await abuse.admit(
      'recovery_request',
      '203.0.113.11',
      'same@example.com',
      NOW,
    );

    const pairKeys = abuseStore.consume.mock.calls
      .map((call) => call[0])
      .filter((input) => input.dimension === 'origin_identifier')
      .map((input) => input.bucketKey);

    expect(pairKeys).toHaveLength(2);
    expect(pairKeys[0]).not.toBe(pairKeys[1]);
    expect(pairKeys.every((key) => /^[0-9a-f]{64}$/u.test(key))).toBe(true);
    expect(JSON.stringify(abuseStore.consume.mock.calls)).not.toContain(
      'same@example.com',
    );
    expect(JSON.stringify(abuseStore.consume.mock.calls)).not.toContain(
      '203.0.113.',
    );
  });

  it('normalizes IPv4-mapped origins to one security identity', async () => {
    const abuseStore = store();
    abuseStore.consume.mockImplementation(async (input) => ({
      ...input,
      count: 1,
    }));
    const abuse = service(abuseStore);

    await abuse.admit(
      'verification_request',
      '::ffff:203.0.113.12',
      'USER@example.com',
      NOW,
    );
    await abuse.admit(
      'verification_request',
      '203.0.113.12',
      'user@example.com',
      NOW,
    );

    const pairKeys = abuseStore.consume.mock.calls
      .map((call) => call[0])
      .filter((input) => input.dimension === 'origin_identifier')
      .map((input) => input.bucketKey);

    expect(pairKeys[0]).toBe(pairKeys[1]);
  });

  it('shares the password-login origin policy and limits only invalid pairs', async () => {
    const abuseStore = store();
    abuseStore.consume.mockImplementation(async (input) => ({
      ...input,
      count:
        input.operation === 'password_login' &&
        input.dimension === 'origin_identifier'
          ? 11
          : 1,
    }));
    const abuse = service(abuseStore);

    await expect(
      abuse.admitLoginOrigin('203.0.113.20', NOW),
    ).resolves.toBeUndefined();

    await expect(
      abuse.recordInvalidLogin(
        '203.0.113.20',
        'guess-target@example.com',
        NOW,
      ),
    ).rejects.toBeInstanceOf(AuthRateLimitedError);

    expect(abuseStore.consume.mock.calls[0]?.[0]).toMatchObject({
      operation: 'password_login',
      dimension: 'origin',
    });
    expect(abuseStore.consume.mock.calls[1]?.[0]).toMatchObject({
      operation: 'password_login',
      dimension: 'origin_identifier',
    });
  });

  it('maps persistence failures to bounded unavailable admission', async () => {
    const abuseStore = store();
    abuseStore.consume.mockRejectedValue(new Error('mongo unavailable'));
    const abuse = service(abuseStore);

    await expect(
      abuse.admit(
        'recovery_request',
        '203.0.113.30',
        'user@example.com',
        NOW,
      ),
    ).rejects.toBeInstanceOf(AuthAbuseControlUnavailableError);
  });
});
