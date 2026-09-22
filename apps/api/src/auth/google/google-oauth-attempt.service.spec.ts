import type {
  GoogleOAuthAttemptRecord,
  GoogleOAuthAttemptStore,
} from './google.types';
import { GoogleOAuthAttemptService } from './google-oauth-attempt.service';

describe('GoogleOAuthAttemptService', () => {
  const created: GoogleOAuthAttemptRecord[] = [];
  const store: GoogleOAuthAttemptStore = {
    create: jest.fn((input: GoogleOAuthAttemptRecord) => {
      created.push(input);
      return Promise.resolve();
    }),
    consumeByStateHash: jest.fn(() => Promise.resolve(null)),
  };

  beforeEach(() => {
    created.length = 0;
    jest.clearAllMocks();
  });

  it('stores only hashed state/nonce and a server-only PKCE verifier', async () => {
    const service = new GoogleOAuthAttemptService(store);
    const issued = await service.issue(
      'login',
      undefined,
      '/dashboard',
      new Date('2026-09-22T16:00:00.000Z'),
    );

    expect(issued.state).toHaveLength(43);
    expect(issued.nonce).toHaveLength(43);
    expect(issued.codeChallenge).toHaveLength(43);
    expect(created).toHaveLength(1);

    const record = created[0];
    if (!record) throw new Error('Expected stored OAuth attempt');

    expect(record.stateHash).not.toBe(issued.state);
    expect(record.nonceHash).not.toBe(issued.nonce);
    expect(record.codeVerifier).toHaveLength(43);
    expect(record.returnPath).toBe('/dashboard');
    expect(JSON.stringify(record)).not.toContain(issued.state);
    expect(JSON.stringify(record)).not.toContain(issued.nonce);
  });

  it('rejects external or malformed return targets', async () => {
    const service = new GoogleOAuthAttemptService(store);

    await service.issue('login', undefined, 'https://evil.example/steal');
    await service.issue('login', undefined, '//evil.example/steal');

    expect(created.map((record) => record.returnPath)).toEqual([
      '/login',
      '/login',
    ]);
  });

  it('does not query persistence for malformed state', async () => {
    const service = new GoogleOAuthAttemptService(store);

    await expect(service.consume('bad-state')).resolves.toBeNull();
    expect(store.consumeByStateHash).not.toHaveBeenCalled();
  });

  it('matches callback nonce only through its hash', async () => {
    const service = new GoogleOAuthAttemptService(store);
    const issued = await service.issue('login', undefined, '/login');

    const record = created[0];
    if (!record) throw new Error('Expected stored OAuth attempt');

    expect(service.nonceMatches(record, issued.nonce)).toBe(true);
    expect(service.nonceMatches(record, 'x'.repeat(43))).toBe(false);
  });
});
